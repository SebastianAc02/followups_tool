# Tracking antes del toque (correo + visto de WhatsApp)

Fecha: 2026-07-15
Owner: Sebastián

## El problema

Antes de hacer un toque no hay forma de saber si el contacto vio el correo anterior, a qué
hora lo vio, ni si hizo clic. Sebastián decide a quién llamar primero a ciegas.

## Qué existe hoy (medido, 2026-07-15)

El dato de correo YA se captura y nunca se lee:

- `evento_tracking` (append-only, idempotente por `proveedor_evento_id`) guarda `tipo`,
  `canal`, `fecha_evento` con timestamp exacto.
- `/api/track/open/route.ts` inserta `tipo='abierto'` por pixel; `/api/track/click` hace lo
  propio con los clics.
- `gmail.ts:177` inyecta el pixel y sustituye `{{email}}` en el adapter, asi que el camino
  de Gmail no depende del merge-tag de Apollo. Es independiente del bug de `[nombre]`.
- Apollo NO da aperturas (`apollo.ts:238`: `opened`/`clicked` no vienen con fecha propia en
  `emailer_messages`, se descartaron a proposito). El pixel propio es la unica fuente.
- **`guardarEventoTracking` (repository.ts:4240) es el unico acceso a la tabla. Cero
  lecturas.** Ese es el bug de fondo: el dato entra y nunca sale.

El visto de WhatsApp NO se captura: el webhook de Evolution solo procesa mensajes
entrantes. Pero el correlator ya existe: `evolution.ts:174` guarda `data.key.id` del mensaje
enviado, y `push.ts` lo persiste en `paso_inscripcion.proveedor_mensaje_id`.

## Alcance

Mostrar, como pill en la fila de `/cola`, si el contacto abrio el correo anterior (cuantas
veces y hace cuanto), si hizo clic, y si vio el WhatsApp.

**Revision al armar el plan (2026-07-15):** medido contra la rama `feat/modo-prueba-demo`,
casi toda la CAPTURA y parte de la LECTURA ya estan construidas y commiteadas. El alcance
real es mas chico de lo que asumia la version anterior de este spec. Ver "Qué falta".

Fuera: ficha de empresa, vista de campaña, pantalla de llamada. Nada de cambiar la captura
del correo, que ya funciona.

## Qué YA existe en la rama (medido, no asumido)

- **Captura del visto de WhatsApp: COMPLETA.** `parsearAcuseLectura` (evolution.ts:336),
  `guardarVistoWhatsapp` (repository.ts:4256) y el webhook con ruteo por base
  (`app/api/webhooks/whatsapp/route.ts`, rama del acuse antes del parseo de entrantes).
  Correlaciona `key.id` -> `proveedor_mensaje_id`, idempotente por `proveedor_evento_id`,
  rutea por `esLineaDePruebas(instancia)`. No hay nada que construir aca.
- **Lectura por campaña: existe.** `aperturasPorCampana(idCampana)` (repository.ts:4316) y
  `actividadDeCampana(idCampana)` (4369) leen los 6 tipos de `evento_tracking`. PERO son por
  campaña y devuelven BOOLEANOS (`abrio`/`hizoClic`/`vioWhatsapp`), no sirven para el pill de
  la cola, que es por empresa y necesita conteo + hora.

## Qué falta

1. Una lectura POR EMPRESA con conteo de veces y ultima hora de apertura (las existentes son
   por campaña y booleanas).
2. El core `resumen-tracking.ts` con la regla de temperatura (no existe).
3. El pill en la fila de la cola (`ColaUnificada`, la cola de Sebastián en modo split).

## Diseño

### 1. Lectura por empresa

Una funcion nueva en el repository, `resumenTrackingPorEmpresa(idsEmpresa)`, que dado el set
de empresas de la cola devuelve por empresa: numero de aperturas, numero de clics, ultima
fecha de apertura (ISO) y si vio el WhatsApp. Mismos joins que `aperturasPorCampana`
(`evento_tracking` -> `paso_inscripcion` -> `destinatario` -> `inscripcion`), pero
filtrando por `inscripcion.idEmpresa IN (...)` y contando en vez de marcar booleanos.
Una query para toda la cola, cruce en TS (mismo criterio que las dos lecturas que ya existen).

### 2. Veredicto (core puro)

`app/core/resumen-tracking.ts`: recibe la señal (conteos + ultima apertura + vioWhatsapp) y
`ahora` inyectado (patron de `pollTracking`), devuelve el texto del pill y la temperatura. No
importa DB ni adaptadores, segun la constitucion.

El modulo trae el boilerplate ya resuelto (formateo "hace 2h", armado del texto del pill). El
UNICO hueco es `temperaturaDe(señal, ahora)`: la regla de negocio de que cuenta como interes
real. La escribe Sebastián (5-10 lineas, modo learning).

### 3. UI

Un pill en `ColaUnificada.tsx` al lado de `Respondió`, con el mismo patron de tooltip que ya
usan `PBX`, `Cadencia` y `Respondió`. Formato: `Abrió 3× · hace 2h`. Sin rediseño de la fila.
El color del pill sale de la temperatura que devuelve el core. `FilaUnificada` (agenda.ts)
gana un campo opcional `tracking` que `page.tsx` llena cruzando el Map por `id` de empresa,
igual que hoy hace con `respuestaPendiente`.

## Decisiones y trade-offs

**Contadores calculados, no denormalizados.** Se descarto guardar `aperturas`/`ultima_apertura`
como columnas en `inscripcion` actualizadas al escribir el evento. Seria mas rapido de leer,
pero duplica estado que ya vive en `evento_tracking` y se puede desincronizar en silencio
(misma familia del bug de la campana zombi). A la escala de una cola de decenas de filas el
`GROUP BY` sobra.

**Veces + hora, no solo hora.** Una apertura suelta puede ser el proxy de Gmail o la precarga
de Apple Mail, no un humano. El conteo es lo que separa el ruido (1 apertura a los 2 segundos
del envio) del interes real (3 aperturas repartidas). Por eso el pill lleva las dos cosas.

**El clic entra en el resumen.** Es señal mas fuerte que la apertura porque el proxy no hace
clic, y ya se captura.

## Riesgos

- **El pixel miente hacia arriba.** Gmail carga imagenes por proxy y Apple Mail Privacy
  Protection precarga todo. "Abierto" es señal debil en positivo y fuerte en negativo (nunca
  abierto = casi seguro no lo vio). La regla de temperatura tiene que asumir esto.
- **Evolution necesita config, no solo codigo.** `MESSAGES_UPDATE` hay que suscribirlo en la
  instancia; si no, la rama nueva del webhook nunca se ejecuta y no falla de forma visible.
- **`APP_BASE_URL` manda en el pixel.** Si apunta mal, el pixel no llega y todo sale "sin
  abrir" sin error ninguno.

## Pruebas

- Core (`resumen-tracking`): tabla de casos sobre la regla, con `ahora` fijo.
- Webhook: `MESSAGES_UPDATE` con status `READ` guarda el evento; reintento del mismo `key.id`
  no duplica; `key.id` desconocido se ignora con ack 200; la linea de pruebas escribe en
  `pruebas.db` y no en la real.
- Repository: el `GROUP BY` cuenta por empresa lo que corresponde y no cruza empresas.
