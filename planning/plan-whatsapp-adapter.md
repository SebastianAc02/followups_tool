# Plan: canal WhatsApp via Evolution API

Estado: decisiones de diseño cerradas (2026-07-09, time constraint explicito, las
tomo yo con enfoque SOLID). Tareas 1-4 (base SOLID + adaptador + conexion) DONE,
tests en verde (426). Metodo de conexion real: **pairing-code de 8 caracteres, NO QR**
-- el QR de WhatsApp/Baileys quedo bloqueado server-side por el crackdown de WhatsApp
de junio 2026 (Shortcake/passkey), falla desde el primer intento con "no se pueden
vincular dispositivos"; `iniciarConexion` lo pide por defecto (`GET
/instance/connect/{instancia}?number=`), la rama de QR queda escrita aparte
(`iniciarConexionPorQr`, extend-only) por si el flujo se reabre. `key.id` como id de
mensaje de `sendText` quedo CONFIRMADO en vivo (ya no es hipotesis). Tareas 5-6
(webhook + caso de uso de respuesta) siguen bloqueadas hasta ver un `MESSAGES_UPSERT`
real (C1-C4 de whatsapp-osserver/FASE0-ESTADO.md) -- sin eso no hay payload real que
parsear, y "no inventar el dato" es la regla del proyecto.

**Multi-usuario confirmado (2026-07-09):** cada quien conecta su PROPIO numero de
WhatsApp, no solo Sebastian. `linea_whatsapp` gano `id_usuario` nullable (NULL = pool
compartido, no-null = personal de ese usuario) antes de la primera aplicacion de la
migracion (tabla nueva, sin datos, no hizo falta ALTER TABLE). `whatsapp` ya esta
registrado en `app/conectores/catalogo.ts` (modoSugerido: `admin` -- la credencial ahi
es el API key del SERVIDOR Evolution completo, compartido; quien conecta que numero es
un dato de `linea_whatsapp`, no del conector). Migracion TODAVIA no aplicada contra
isps.db real.

Reemplaza la version del 2026-07-08 que dejaba 3 decisiones reservadas.

El servidor vive en `../whatsapp-osserver/` (Evolution API + Postgres + Redis, ver su
README.md: Fase 0 local, Fase 1 VPS Hetzner). Este documento cubre SOLO el lado de la
followups-tool.

## Norte de diseño: extend-only, nunca quitar

El objetivo no negociable de esta fase: el dia que cambiemos de proveedor (Evolution ->
Meta Cloud API, Twilio, 360dialog) NO borramos ni reescribimos nada; solo creamos un
adaptador nuevo. Cada decision de abajo se escogio por eso. El repo ya tiene el mecanismo
OCP montado (`app/adapters/registro-envio.ts`: registro `canal -> proveedor`, `push.ts` y
`tracking.ts` reciben el adaptador ya resuelto y nunca nombran a Apollo); este plan se
enchufa a ese mecanismo, no crea uno paralelo.

## Contexto y restricciones (dadas)

- Proveedor v1: Evolution API self-hosted, conector Baileys. `canal = 'whatsapp'` ya es
  dato en `toque`; falta el transporte, el modelo de lineas y la conexion (QR).
- Dos niveles de linea: la **personal** de Sebastian (prioritarios, todo pasa por
  borrador -> aprobar -> enviar, como `llamada` hoy) y 2-3 lineas de **pool**
  (consumibles) para las ~500-600 empresas masivas.
- Requisito duro: cuando alguien responde a CUALQUIER linea, la tool se entera al
  instante (webhook), corta la cadencia local de ese contacto y encola el corte en Apollo
  (`sacarDestinatario`, ya existe). El historial completo queda en el Postgres de
  Evolution; en `toque` guardamos lo operativo.
- Destino final: la tool completa + Evolution en el mismo VPS (webhook por localhost,
  worker 24/7). Arrastra tareas de infra (dockerizar, auth delante del cockpit, backup de
  isps.db, rotar keys expuestas).

## Diferencia clave con Apollo (leer antes de tocar codigo)

Apollo es un MOTOR externo: le entregamos la secuencia y manda solo. Evolution es
TRANSPORTE puro: no tiene concepto de secuencia; el motor somos nosotros (motor-cadencia +
goteo deciden que paso toca hoy y el adaptador solo entrega UN mensaje a UN numero).
Ademas los eventos llegan al reves: Apollo se lee por poll (`leerEventosNuevos`), Evolution
nos EMPUJA por webhook.

## Decisiones de diseño (cerradas)

### D1. Dos puertos: transporte y conexion, separados

- `CanalEntrega` (transporte: mandar un mensaje) y `ConexionLinea` (aparear, estado,
  desconectar) son puertos distintos.
- Por que: tienen ciclos de vida y dependencia-de-proveedor distintos. El dia de Meta
  Cloud API el transporte se mantiene y `ConexionLinea` se vuelve casi no-op (Cloud API ya
  viene conectada, sin QR). Meterlos en una sola interfaz junta `enviarMensaje` con
  `mostrarQR`, que no comparten nada (violaria SRP e ISP).

### D2. Segregar `EnvioAdapter` por ISP, NO crear un puerto paralelo

Hallazgo que fijo esta decision: `EnvioAdapter` (app/core/ports/envio.ts) es en realidad
TRES roles usados por tres consumidores distintos:

| Rol | Metodos | Consumidor | WhatsApp lo honra |
|-----|---------|-----------|-------------------|
| Entrega | `enviarPaso` | `push.ts` (goteo) | Si |
| Tracking por poll | `leerEventosNuevos`, `sacarDestinatario` | `tracking.ts` | No (webhook) |
| Motor de secuencia externa | `crearCampanaExterna`, `sincronizarCopy`, `archivarCampana` | acciones de campana | No (el motor somos nosotros) |

Decision: partir `EnvioAdapter` en esos tres roles. **Es aditivo, no se quita nada:**

- AGREGAR `CanalEntrega` (`enviarPaso`), `TrackingPoll` (`leerEventosNuevos`,
  `sacarDestinatario`), `MotorSecuencia` (`crearCampanaExterna`, `sincronizarCopy`,
  `archivarCampana`).
- REDEFINIR `EnvioAdapter = CanalEntrega & TrackingPoll & MotorSecuencia`. Apollo lo sigue
  satisfaciendo igual; ningun consumidor existente se rompe.
- El registro de entrega pasa a `Record<Canal, CanalEntrega | null>`. `push.ts` ya solo
  usaba `enviarPaso`, asi que su firma se AMPLIA (acepta mas), no se rompe.

WhatsApp implementa SOLO `CanalEntrega` y entra al MISMO registro y al MISMO loop de
`push.ts`. Cero no-ops, cero edicion del core.

Por que no las alternativas:
- Puerto paralelo nuevo (`MensajeriaDirecta` aparte): forkearia el despacho; `push.ts` y
  `registro-envio.ts` tendrian que ramificar "es EnvioAdapter o MensajeriaDirecta",
  reintroduciendo el branch-por-tipo-de-proveedor que el registro fue hecho para matar.
- Reusar `EnvioAdapter` gordo con no-ops: WhatsApp implementaria 5 de 6 metodos como
  mentiras. Viola ISP (interfaz gorda) y LSP (`leerEventosNuevos` siempre vacio no honra
  el contrato).

### D3. Un solo destinatario de dominio

`enviarPaso` recibe un contacto de dominio `{ nombre; email: string | null; telefono:
string | null }`. Apollo lee `email`, WhatsApp lee `telefono`; cada adaptador proyecta su
correlator. Es AMPLIAR `DestinatarioEnvio` (de `email: string` a nullable), no un tipo
nuevo por canal. Mantiene al core cerrado: un canal futuro lee el campo que necesite sin
que quien llama tenga que ramificar por canal.

### D4. Politica de ruteo y throttle (la logica de negocio)

Vive en el core (extiende `goteo.ts`), antes de entregar al transporte:

- Prioritarios (empresa con owner personal) -> linea personal, siempre borrador -> aprobar
  -> enviar (como `llamada`: no entra a `CANALES_AUTOMATICOS`). Techo 10/dia.
- Masivos -> round-robin sobre lineas en estado `activa`. Techo default 25/dia por linea
  (configurable en la fila).
- `calentando` -> entra al pool con techo reducido (5/dia) hasta que se promueve a
  `activa` a mano.
- `caida` -> sale del round-robin. Su mensaje del ciclo va a otra linea del pool. Si TODO
  el pool esta caido, el mensaje espera (no se pierde, no se fuerza). Re-ruteo manual en v1
  (constitucion: deteccion de caida es manual).
- Jitter obligatorio: 60-180s aleatorio entre mensajes de la misma linea. Baileys son
  lineas no oficiales; el espaciado es lo que las mantiene vivas.

### D5. Modelo de datos y rutas neutrales al proveedor

- Tabla `linea_whatsapp` con columna `referencia_proveedor` (NO `instancia_evolution`):
  "como el proveedor identifica esta linea" (Evolution mete el nombre de instancia; Meta
  meteria el `phone_number_id`).
- Ruta del webhook: `/api/webhooks/whatsapp` (NO `/evolution`). El parseo del payload de
  Evolution vive DENTRO del adaptador, no en la ruta.
- `ConexionLinea.iniciarConexion(referenciaProveedor, numero)` devuelve tipo neutral:
  `{ tipo: 'codigo'; formato: 'qr' | 'pairing'; data: string } | { tipo: 'token'; campos:
  CampoConexion[] }`. La UI renderiza segun `tipo`/`formato`, ciega al proveedor.
  ACTUALIZADO (2026-07-09): el QR quedo bloqueado server-side por el crackdown de
  WhatsApp de junio 2026 -- Evolution/Baileys aparea hoy SOLO por pairing-code de 8
  caracteres (`formato: 'pairing'`); `formato: 'qr'` queda modelado (y una rama de
  codigo aparte, `iniciarConexionPorQr`, extend-only) por si el flujo se reabre. Meta
  Cloud API seguiria siendo `tipo: 'token'`.

### D6. UI de lineas en conectores

WhatsApp es un conector que se EXPANDE a una lista de lineas (no un `ConectorRow` normal de
una-credencial). La seccion "Lineas de WhatsApp" gestiona filas de `linea_whatsapp`
(agregar, ver estado, aparear por pairing-code, marcar caida). Por eso `linea_whatsapp` es
tabla aparte y no otra fila de `conector`.

ACTUALIZADO (2026-07-09, multi-usuario): la seccion de lineas no es solo-admin. Cada
usuario en sesion ve/agrega SU propia linea personal (`linea_whatsapp.id_usuario =
sesion.id`) y aparea la suya con su propio numero; el admin administra aparte las lineas
de pool (`id_usuario = NULL`), igual que hoy administra Notion global. Mismo principio
de autoridad que ya existe en `politica.ts` para conectores personales (cada quien la
suya), aplicado a nivel de fila de linea en vez de nivel de conector completo.

## Modelo de datos (migracion unica, chica)

Tabla nueva `linea_whatsapp`:

- `id`
- `numero` (E.164 sin +)
- `tipo` (`personal` | `pool`)
- `referencia_proveedor` (como el proveedor nombra la linea; para Evolution = nombre de
  instancia)
- `estado` (`calentando` | `activa` | `caida`)
- `techo_diario` (int; default 25 pool, 10 personal, 5 calentando)
- `fecha_creacion`

No se toca `toque` (ya tiene `canal` + `id_contacto` + `que_paso`). El texto del mensaje
entrante/saliente va en `que_paso`; el historial completo queda consultable en Evolution
(patron Granola: resumen operativo aca, fuente completa en el proveedor).

## Piezas a construir (orden, un diff por tarea)

1. **DONE (2026-07-09).** Segregacion de `EnvioAdapter` (D2): `CanalEntrega` /
   `TrackingPoll` / `MotorSecuencia`, `EnvioAdapter` como interseccion. `DestinatarioEnvio`
   ampliado a `telefono` nullable (D3), propagado a `pasoInscripcionesPendientes`.
   `registro-envio.ts` gano `crearRegistroEntrega()` (angosto, `Record<Canal, CanalEntrega
   | null>`, lo usa `tareasPush`) separado de `crearRegistroEnvio()` (completo, lo siguen
   usando `tareaTracking` y `campanas/[id]/actions.ts`) -- wrinkle que D2 no habia
   resuelto, ver el comentario en registro-envio.ts. Cero cambio de comportamiento; 418
   pruebas existentes verdes sin tocarlas.
2. **DONE (2026-07-09, Haiku).** Migracion `linea_whatsapp`
   (`scripts/migrate_whatsapp_{dryrun,apply}.py`, patron identico a
   migrate_conectores) + tabla espejo `lineaWhatsapp` en `schema.ts`. NO aplicada
   contra la base real todavia (no hay lineas que sembrar hasta que Sebastian aparee la
   primera).
3. **DONE (2026-07-09, actualizado).** Adaptador de transporte en `app/adapters/evolution.ts`
   implementando `CanalEntrega`. Pruebas con fetch mockeado contra shapes reales
   capturados/confirmados en vivo contra Fase 0 (`GET /instance/connect/{instancia}
   ?number=`, `GET /instance/fetchInstances`, error 500 de `POST /message/sendText` con
   instancia sin conectar). `sendText` de EXITO ({key:{id}, status:'PENDING'}) quedo
   CONFIRMADO en vivo (linea real conectada por pairing-code) -- ya no es hipotesis,
   `key.id` es el id de mensaje real.
4. **DONE (2026-07-09, actualizado).** Puerto `ConexionLinea` (D1, en
   `app/core/ports/conexion.ts`) + su implementacion en `evolution.ts`. `InicioConexion`
   generalizado a `{tipo:'codigo', formato:'qr'|'pairing', data}` (D5 revisado): el QR
   quedo bloqueado server-side por el crackdown de WhatsApp de junio 2026 (falla con "no
   se pueden vincular dispositivos" desde el primer intento, no es un bug de Evolution).
   `iniciarConexion(referenciaProveedor, numero)` pide pairing-code POR DEFECTO
   (`?number=` en la query, verificado en vivo: `pairingCode` de 8 caracteres). La rama
   de QR queda escrita aparte (`iniciarConexionPorQr`, extend-only, no forma parte de
   `ConexionLinea`) para debug manual o si WhatsApp reabre el flujo. `estadoConexion`
   (filtra `fetchInstances` por nombre), `desconectar` (`DELETE
   /instance/logout/{instancia}`, documentado, no ejercido en vivo para no resetear
   lineas activas).
5. **Webhook de entrada** `app/api/webhooks/whatsapp/route.ts`:
   - Autenticacion del webhook (token secreto en URL o header).
   - Solo `MESSAGES_UPSERT` con `fromMe: false`.
   - Traduce el payload a evento de dominio (`llegoRespuestaWhatsapp(referenciaProveedor,
     telefono, texto, fecha)`) y delega al core. El route NO decide nada: parsea, valida,
     delega.
6. **Caso de uso en el core** `llego-respuesta.ts`: matchear telefono -> contacto ->
   empresa; cortar cadencia local; encolar corte en Apollo via outbox (idempotente); crear
   toque entrante en borrador para revision humana (constitucion: la IA no escribe sin
   revision).
7. **Envio por goteo (D4).** Conectar el motor con el transporte para canal whatsapp,
   aplicando ruteo/throttle/jitter. Nivel personal: solo mensajes aprobados en la cola del
   dia. Sumar `whatsapp` a `CANALES_AUTOMATICOS` (solo para el pool; el personal sigue por
   /cola).
8. **UI de lineas (D6)** en `/conectores`: seccion WhatsApp que lista `linea_whatsapp`,
   agrega linea, muestra el QR de `iniciarConexion`, refleja estado, permite marcar caida.
9. **Infra** (tareas separadas, no colgadas de las de dominio): Dockerfile de la app,
   compose unificado en el VPS, auth delante del cockpit, backup diario de isps.db, rotar
   las keys expuestas ANTES de subirlas. OJO: `EVOLUTION_API_BASE_URL` cae a
   `http://localhost:8080` por default (correcto en local); en el VPS, con la tool
   corriendo dentro del mismo compose que Evolution, hay que fijarlo a
   `http://evolution:8080` (nombre del servicio, red interna de Docker) -- si no, la
   credencial guardada en /conectores no alcanza para que el adaptador conecte. Detalle
   completo en `../whatsapp-osserver/README.md`, seccion Fase 1.

## Fuera de alcance (no construir ahora)

- Responder conversaciones desde la tool (v1 solo manda, recibe y corta).
- Cosecha/import del historial viejo de WhatsApp (constitucion: fuera de v1).
- Multi-dispositivo por linea, grupos, media (solo texto en v1).
- Deteccion automatica de "linea a punto de caer" (v2; en v1 el estado se cambia a mano).

## Criterio de listo

Un contacto de prueba recibe un paso de cadencia por una linea del pool, responde, y sin
intervencion humana: la cadencia local queda cortada, el corte en Apollo queda encolado en
outbox, y aparece un toque borrador con su respuesta en la cola de revision. Todo con
pruebas y sin que el core importe nada de Evolution. Y: una linea nueva se aparea desde
`/conectores` escaneando el QR, sin tocar codigo.
