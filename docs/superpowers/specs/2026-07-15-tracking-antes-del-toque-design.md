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

Correo (leer lo que ya existe) y visto de WhatsApp (capturar lo que falta), mostrados como
un pill en la fila de `/cola`.

Fuera: ficha de empresa, vista de campaña, pantalla de llamada. Nada de cambiar la captura
del correo, que ya funciona.

## Diseño

### 1. Captura del visto de WhatsApp

Suscribir `MESSAGES_UPDATE` en la instancia de Evolution. En el webhook, una rama nueva: si
el update trae status `READ`, correlacionar `key.id` contra `paso_inscripcion.proveedor_mensaje_id`
y guardar `tipo='visto'`, `canal='whatsapp'`.

- Idempotencia: `proveedorEventoId = wa-read:${key.id}`. El indice unico ya existente absorbe
  el reintento del webhook. No hay codigo de dedup nuevo.
- **Ruteo de base:** la ruta entra sin cookie, asi que decide el DATO via
  `esLineaDePruebas(instancia)` de `app/db/ruteo-linea.ts`, igual que el resto del webhook.
  Ver `project_modo_prueba_frontera_request`: es la familia de bug que ya costo una sesion.
- Correlacion fallida (mensaje que no reconocemos): se ignora y se ack limpio, mismo criterio
  que el pixel (`/api/track/open` nunca rompe la entrega por un fallo de correlacion).

### 2. Lectura

Una funcion nueva en el repository que, dado el set de empresas de la cola, devuelve por
empresa: aperturas, clics, ultima fecha de apertura y visto de WhatsApp. Un solo `GROUP BY`
sobre `evento_tracking` unido a `paso_inscripcion` -> `destinatario` -> `inscripcion`, no una
query por fila.

### 3. Veredicto (core puro)

`app/core/resumen-tracking.ts`: recibe los contadores y `ahora` inyectado (patron de
`pollTracking`), devuelve el texto del pill y la temperatura. No importa DB ni adaptadores,
segun la constitucion.

Aca vive la regla de negocio de que cuenta como interes real. La escribe Sebastián.

### 4. UI

Un pill en `ColaUnificada.tsx` al lado de `Respondió`, con el mismo patron de tooltip que ya
usan `PBX`, `Cadencia` y `Respondió`. Formato: `Abrió 3× · hace 2h`. Sin rediseño de la fila.

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
