# Secuencias de correo por Gmail (Workspace) — Design

Estado: PROPUESTO (2026-07-14). Aprobado en conversación por Sebastián, pendiente de convertir
en plan de implementación (arrancando por la Etapa 1).

## Problema

Hoy el canal `correo` sale siempre por Apollo, desde un buzón compartido a nombre de una sola
persona (memoria `reference_apollo_sender_name_seat`: 3 buzones, todos de la misma persona, no
editable por usuario ni por API). Si otro miembro del equipo lanza una cadencia de correo, el
mensaje sale con el nombre de otra persona — problema de confianza con el prospecto, no un bug
técnico. Es la razón por la que el spec `2026-07-14-gate-canal-campanas-design.md` bloquea el
canal `correo` sin excepción hoy: no hay nada que ofrecerle al usuario en `/conectores` para
arreglarlo.

Se necesita una segunda vía de envío de correo: cada usuario conecta **su propio Gmail
corporativo** (`@onepay.la`, Google Workspace) y sus correos de cadencia salen a su nombre real.
Apollo se queda tal cual (enriquecimiento de prospectos + su propio camino de envío para quien
no tenga Gmail conectado) — esto es un proveedor nuevo, no un reemplazo.

## Contexto verificado

- **La costura ya existe y está bien pensada.** `app/adapters/registro-envio.ts` es el
  ÚNICO lugar que decide "qué proveedor manda este canal" (comentario explícito en el archivo:
  pedido de Sebastián, sesión 2026-07-09, SOLID). `push.ts` y `tracking.ts` reciben el adaptador
  ya resuelto — nunca conocen Apollo ni Evolution por nombre. Gmail se monta ahí sin tocar el
  core.
- **El puerto ya segrega por rol real, no por canal.** `app/core/ports/envio.ts` define
  `CanalEntrega` (enviar), `TrackingPoll` (leer eventos + sacar destinatario) y `MotorSecuencia`
  (crear/sincronizar/aprobar/archivar secuencia externa) como interfaces separadas.
  `EnvioAdapter` es su intersección. WhatsApp/Evolution ya demuestra el patrón que Gmail va a
  seguir: implementa **solo `CanalEntrega`**, entra al mismo loop genérico de `push.ts` sin
  no-ops de los otros dos roles. Gmail no tiene "secuencia externa" (no hay concepto de
  `emailer_campaign` en Gmail) — la cadencia la sigue manejando nuestro propio worker
  (materializar → push), igual que hoy con WhatsApp.
- **No existe hoy ninguna dependencia de Google/OAuth** (`googleapis`, `google-auth-library`,
  nada). Es la única pieza de infraestructura genuinamente nueva de este proyecto.
- **El patrón de credencial-por-usuario ya existe** (Granola: `conector` modo `personal`,
  `credencialCiphertext` cifrado con `cifrar`/`descifrar`, `guardarCredencialConector(proveedor,
  credencial, idUsuario)` / `leerCredencialConector(proveedor, idUsuario)`). Gmail reusa el mismo
  mecanismo sin cambio de schema — solo cambia qué JSON va cifrado adentro.
- **El patrón de verificación real al conectar ya existe** (spec
  `2026-07-14-conectores-apollo-granola-design.md`, Pieza B: guarda credencial tentativa → llama
  al proveedor real → muestra algo verificable al usuario → usuario confirma → recién ahí
  `Configurado` de verdad). Gmail sigue el mismo flujo con un correo de prueba real en vez de una
  nota de Granola.
- **El tracking propio por pixel es independiente de canal.** `/api/track/open` (pixel 1x1) y
  `/api/track/click` (redirect 302) se inyectan en el HTML del cuerpo al armar el envío;
  correlacionan por `(proveedorCampanaId, email)`. No saben ni les importa si el HTML salió por
  Apollo o por Gmail — Gmail los reusa tal cual.
- **`campana.owner` existe en el schema pero nunca se puebla hoy** (mismo hueco que describe
  `gate-canal-campanas-design.md`). Rutear correo por dueño depende de que esa columna se llene
  al lanzar — es la MISMA pieza de infraestructura que ese spec ya diseñó para WhatsApp
  (Pieza B: agrupar `pasoInscripcionesPendientes` por dueño → su línea propia). Gmail se cuelga
  del mismo mecanismo, generalizado a también agrupar por dueño → su Gmail propio.
- **`organizacion_miembro`/`user.owner`** ya mapea `owner_canonico` (texto) ↔ `id_user`
  (better-auth) — es la misma convención de dos niveles (memoria
  `project_ownership_dos_niveles`) que resuelve "de quién es esta campaña" a un usuario real.

## Dependencia dura con `gate-canal-campanas-design.md`

Los dos specs tocan el mismo código: `pasoInscripcionesPendientes` (`app/db/repository.ts:3426`)
y `push.ts`, para agrupar el trabajo pendiente por **dueño de la campaña** en vez de resolver un
proveedor global. `gate-canal` Pieza B ya diseñó esa generalización para WhatsApp (línea propia
por dueño); este spec la extiende a correo (Gmail propio por dueño, con fallback a Apollo).

**No se construyen en paralelo a ciegas.** Orden: el refactor de agrupar-por-dueño en
`pasoInscripcionesPendientes` se hace UNA vez (como parte de la Etapa 2 de este spec, o heredado
si `gate-canal` Pieza B ya aterrizó primero) y ambos specs lo consumen. Si alguna de las dos
sesiones que trabaja esto sigue activa al momento de implementar, confirmar con Sebastián antes
de tocar ese archivo — precedente ya visto (memoria `project_pipeline_colision_sesion_concurrente`).

## Principio de diseño (mandato explícito de Sebastián)

Código reusable, con las mejores prácticas de diseño aplicadas donde corresponda (patrones de
diseño, SOLID). El criterio concreto: **el día que se quiera cambiar de proveedor de Gmail por
otra cosa (o agregar un tercero), el cambio se limita al adaptador nuevo + una línea en el
registro — cero cambios en `push.ts`, `tracking.ts`, ni en las acciones de campaña.** Esto ya es
exactamente el patrón que demuestra Evolution/WhatsApp hoy; Gmail es la prueba de que el patrón
generaliza a un tercer proveedor, no una excepción a mantener aparte.

## Decisiones cerradas con Sebastián (2026-07-14)

1. **Coexistencia, no reemplazo.** Apollo se queda (enriquecimiento + su propio envío para quien
   no tenga Gmail). Gmail es un proveedor nuevo del canal `correo`, seleccionado por disponibilidad
   del dueño de la campaña.
2. **Cuentas Workspace `@onepay.la`.** Permite una app OAuth **interna** de Google (Internal user
   type) — exenta de la revisión pública de Google para scopes sensibles/restringidos, controlada
   por el admin del Workspace. Habilita `gmail.send` + `gmail.readonly` sin esperar semanas de
   aprobación.
3. **Tracking completo desde v1**: abiertos/clics (reusa el pixel existente), respuestas (poll de
   hilos) y rebotes (detección de mensajes de bounce). Ver Etapa 3.
4. **Prioridad de ejecución: la Etapa 1 (conector + verificación real) primero**, aislada y
   probada contra un correo real, antes de tocar el worker de producción.
5. **Máxima cautela — esto llega a producción.** Cada etapa se prueba end-to-end contra un correo
   real antes de pasar a la siguiente. Nada se manda sin una compuerta de aprobación explícita
   (mismo principio ya no-negociable del CLAUDE.md y del spec de prueba de Apollo).

## Arquitectura modular (aplica a las 3 etapas)

```
                     ┌─────────────────────────┐
                     │   registro-envio.ts      │   ← única costura, decide
                     │   (canal -> proveedor)   │     "quién manda este canal"
                     └───────────┬──────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
      ApolloAdapter      GmailAdapter (nuevo)   EvolutionAdapter
   (EnvioAdapter completo)  (CanalEntrega +      (CanalEntrega)
                             TrackingPoll,
                             SIN MotorSecuencia)
              │                  │                  │
              └──────────────────┼──────────────────┘
                                 ▼
                    push.ts / tracking.ts (core)
                    — nunca importan Apollo/Gmail/Evolution por nombre
```

`GmailAdapter` implementa `CanalEntrega` (Etapa 2) y `TrackingPoll` (Etapa 3) — **no**
`MotorSecuencia`: Gmail no tiene concepto de "secuencia externa" que crear/sincronizar/archivar,
esa responsabilidad la sigue teniendo el motor de cadencia propio (`materializar` +
`paso_inscripcion`). Mismo criterio de segregación de interfaces que ya separó WhatsApp de
Apollo (comentario de `envio.ts`, sesión 2026-07-09, D2).

Resolución del proveedor de correo por campaña: en vez de `registro-envio.ts` devolver un
`GmailAdapter` o un `ApolloAdapter` fijo para `correo`, la función que resuelve el adaptador para
una fila de `paso_inscripcion` recibe el **dueño de la campaña** y decide:

```ts
function resolverAdaptadorCorreo(idUsuarioDueno: string | null): CanalEntrega {
  const gmail = idUsuarioDueno ? gmailVerificadoDe(idUsuarioDueno) : null;
  return gmail ?? crearApolloAdapter(); // fallback: sin Gmail propio verificado, sigue por Apollo
}
```

Esto es la generalización de la Pieza B de `gate-canal` (que ya agrupa por dueño para WhatsApp) —
mismo mecanismo, dos proveedores posibles en vez de "línea o nada".

---

## Etapa 1 — Conector Gmail: OAuth + verificación real (ejecutar primero)

### Alcance

Conectar una cuenta Gmail de Workspace desde `/conectores`, guardar la credencial cifrada, y
**probarla de verdad antes de marcarla Configurado**. No toca campañas, worker, ni envío de
producción — se puede construir y probar de forma completamente aislada.

### Nuevo tipo de conector

`CATALOGO_CONECTORES` (`app/conectores/catalogo.ts`) gana una entrada:

```ts
{
  id: 'gmail',
  nombre: 'Gmail',
  descripcion: 'Manda cadencias de correo desde tu propio Gmail de Workspace.',
  modoSugerido: 'personal',
}
```

Modo `personal`: cada usuario conecta su propia cuenta, igual que Granola/Apollo. No es un secreto
de equipo.

### Credencial cifrada

`conector.credencialCiphertext` guarda un JSON cifrado (mismo `cifrar`/`descifrar` de
`app/db/repository.ts`, cero cambios de schema):

```ts
type CredencialGmail = {
  refreshToken: string;
  emailCuenta: string;   // la cuenta @onepay.la conectada, para mostrarla en la UI
  scopes: string[];      // auditable: qué permisos se otorgaron en este momento
};
```

Solo el `refreshToken` es sensible de verdad; se guarda igual cifrado por simplicidad (un solo
campo, un solo mecanismo, coherente con cómo se guardan las otras credenciales).

### Flujo OAuth (Google Workspace, app interna)

1. Botón "Conectar Gmail" en `/conectores` → redirige a la pantalla de consentimiento de Google
   (`https://accounts.google.com/o/oauth2/v2/auth`) pidiendo `gmail.send` + `gmail.readonly` +
   `openid email` (para saber qué cuenta se conectó).
2. Callback `/api/conectores/gmail/callback`: intercambia el `code` por `refreshToken` +
   `accessToken` (client oficial `googleapis`), resuelve el email de la cuenta, guarda la
   credencial tentativa (`guardarCredencialConector('gmail', json, sesion.id)`).
3. **Antes de marcar Configurado**: dispara un correo de prueba real a la propia dirección del
   usuario (`"Conexión de Gmail verificada — [fecha/hora]"`), usando la credencial recién
   guardada. Igual patrón que la verificación de Granola (Pieza B del spec de conectores): mostrar
   al usuario "revisa tu bandeja, ¿llegó?" y solo su confirmación explícita marca el conector como
   verdadero-`Configurado`.
4. Si el envío de prueba falla (credencial inválida, scope rechazado, cuota, lo que sea): mismo
   patrón de error+alerta que Granola — mensaje genérico al usuario ("hubo un error, ya le
   avisamos al admin") + `avisarAdminPorWhatsapp` (reusa la función de
   `app/lib/alerta-admin.ts` si ya existe de ese spec; si no, se construye ahí, no aquí — no
   duplicar).

**App de Google Cloud requerida** (trabajo de configuración, no de código): proyecto en Google
Cloud Console, pantalla de consentimiento OAuth tipo **Interno** (requiere ser admin del
Workspace `@onepay.la` o tener uno que lo autorice), credenciales OAuth 2.0 tipo "Web application"
con el callback de arriba como redirect URI autorizado. Esto es una compuerta manual de Sebastián
(igual que vincular buzones de Apollo) — no se construye en código, se hace una vez en la consola
de Google antes de poder probar el flujo.

### Función nueva: `crearGmailAdapter`

`app/adapters/gmail.ts` (nuevo archivo, sigue el patrón de `evolution.ts`/`granola.ts`):

```ts
export function crearGmailAdapter(idUsuario: string): CanalEntrega & TrackingPoll { ... }

// Usado solo por la verificación del conector, no por el envío de producción:
export async function mandarCorreoDePrueba(idUsuario: string, destinatario: string): Promise<void>
```

`mandarCorreoDePrueba` es deliberadamente una función aparte del `enviarPaso` de producción — la
verificación del conector no debe depender de que exista una campaña/paso real, mismo criterio que
`probarLineaAction` de WhatsApp (`app/conectores/lineas-whatsapp-actions.ts`).

### Testing (Etapa 1)

- `crearGmailAdapter`: mock del cliente `googleapis` — token refresca correcto, error de
  credencial inválida se propaga como excepción clara.
- `mandarCorreoDePrueba`: caso feliz (llama al cliente con el `refreshToken` correcto); caso
  credencial ausente; caso error del proveedor → verifica que dispara la alerta al admin.
- Acción del conector (`conectarGmailAction`/callback): guarda credencial tentativa → llama
  verificación → devuelve resultado a la UI, con los mismos 3 casos que Granola (ok / error interno
  con alerta / éxito pendiente de confirmación del usuario).
- **Prueba real manual** (no automatizable, la hace Sebastián): conectar un Gmail `@onepay.la`
  real de prueba, confirmar que el correo de verificación llega, confirmar en la UI.

---

## Etapa 2 — Gmail como proveedor de envío de cadencias (después de Etapa 1)

### Alcance

`push.ts` empieza a mandar correos reales de cadencia por Gmail para las campañas cuyo dueño tenga
Gmail conectado y verificado. Toca el worker en producción — se hace después de que la Etapa 1 esté
probada y de que el refactor de agrupar-por-dueño (compartido con `gate-canal` Pieza B) esté
resuelto.

### Piezas

1. **Poblar `campana.owner`** al lanzar (si `gate-canal` no lo hizo ya primero) — mismo mecanismo,
   una sola vez, ambos specs lo consumen.
2. **`resolverAdaptadorCorreo(idUsuarioDueno)`** (ver diagrama arriba) reemplaza la resolución fija
   `correo: crearApolloAdapter()` de `registro-envio.ts`. Nueva función `gmailVerificadoDe(idUsuario)`
   consulta si ese usuario tiene un conector `gmail` en estado verdadero-`Configurado` (mismo dato
   que ya expone `estadoConector`).
3. **`pasoInscripcionesPendientes('correo', ahora)`** se reescribe para agrupar por dueño (mismo
   cambio que `gate-canal` Pieza B describe para whatsapp, generalizado): por cada campaña con
   filas de correo pendientes, resolver su dueño → su adaptador de correo (Gmail propio o fallback
   Apollo) → agrupar filas por adaptador resuelto.
4. **`push.ts`** itera por grupo (adaptador → filas de ese grupo) en vez de una sola llamada fija —
   mismo patrón que ya describe `gate-canal` Pieza B para whatsapp por línea.

### Compuerta de aprobación (Gmail no tiene `aprobarSecuencia`)

Apollo tiene una compuerta natural: sin `approve`, la secuencia queda creada pero nunca manda
(spec `2026-07-09-prueba-correos-apollo-design.md`). Gmail no tiene ese concepto — si no se
construye una compuerta explícita, lanzar una campaña mandaría el primer paso en el siguiente tick
del worker sin ninguna revisión humana previa. Esto viola el principio no-negociable del CLAUDE.md
("la IA no sincroniza sin revisión humana", extendido aquí a "ningún correo sale sin aprobación
explícita").

**Diseño**: columna nueva `campana.aprobada_envio_gmail` (o reusar/generalizar un flag de
aprobación ya pensado si `gate-canal`/otro spec introduce uno — confirmar antes de duplicar
schema). `pasoInscripcionesPendientes` excluye filas de correo cuyo adaptador resuelto sea Gmail y
la campaña no esté aprobada. Acción explícita "Aprobar y mandar" en la ficha de campaña marca el
flag — mismo patrón visual/UX que el "Aprobar y mandar" que el spec de prueba de Apollo ya diseñó
para ese proveedor. Dos proveedores, una sola idea de UX: el usuario nunca ve dos flujos de
aprobación distintos según qué proveedor resultó elegido por debajo.

### Límites de cuenta (Gmail/Workspace, no negociable para no quemar la cuenta)

- Tope diario de envíos por cuenta (Workspace: ~2000 destinatarios externos/día, pero el límite
  seguro para no disparar flags de spam es mucho menor en la práctica — un valor conservador
  configurable, no hardcoded a un supuesto límite oficial).
- Throttle entre envíos consecutivos de la misma cuenta (no ráfaga).
- Si se topa el límite, las filas restantes quedan pendientes para el siguiente ciclo del worker
  (mismo mecanismo de reintento que ya existe, `ESCALONES_MINUTOS`), no se pierden ni se marcan
  como fallo.

### Testing (Etapa 2)

- `resolverAdaptadorCorreo`: con Gmail verificado → Gmail; sin Gmail o no verificado → Apollo;
  dueño null (dato viejo) → Apollo. Puro, sin DB (recibe el resultado de la consulta ya resuelto,
  mismo criterio de core-sin-DB que `readiness-canal-usuario` de `gate-canal`).
- `pasoInscripcionesPendientes` para correo: dos campañas, dueños distintos, uno con Gmail y otro
  sin — cada grupo llama al adaptador correcto, no se mezclan.
- Compuerta de aprobación: campaña con Gmail resuelto y sin aprobar → cero filas devueltas; tras
  aprobar → las filas aparecen.
- Tope/throttle: mock de reloj + contador — al llegar al tope, deja de mandar en ese ciclo y no
  marca fallo en las filas restantes.
- **Prueba real end-to-end** (Sebastián, sobre el conector ya verificado en Etapa 1): campaña de
  prueba, 1 destinatario propio, lanzar → aprobar → confirmar que el correo llega desde SU Gmail,
  no desde Apollo.

---

## Etapa 3 — Tracking Gmail: abiertos/clics + respuestas + rebotes (después de Etapa 2)

### Abiertos/clics (reusa lo existente, cero código nuevo de tracking)

El pixel (`/api/track/open`) y el link-wrapper (`/api/track/click`) ya se inyectan en el HTML del
cuerpo al armar el envío, independiente de canal. Gmail hereda esto gratis: mismo cuerpo HTML,
mismo pixel, mismo correlator `(proveedorCampanaId, email)`. Único cambio: al enviar por Gmail,
`enviarPaso` debe inyectar el pixel/link igual que ya lo hace el camino de Apollo (mover esa
inyección a un punto compartido si hoy vive dentro del adaptador de Apollo — evitar duplicar la
lógica de inyección en dos adaptadores, ver nota de reuso abajo).

### "Enviado" (reemplaza el poll de Apollo para filas de Gmail)

Gmail no tiene un endpoint de "eventos de tracking" como Apollo — el `messageId`/`threadId` que
devuelve la API de `gmail.send` (`users.messages.send`) ES la confirmación de envío. `enviarPaso`
de Gmail devuelve `EnvioResultado { proveedor: 'gmail', proveedorMensajeId: messageId }` y guarda
también el `threadId` (columna nueva o campo en `detalle`, necesaria para correlacionar respuestas
del mismo hilo en el punto siguiente).

### Respuestas (poll de hilos, nuevo)

`GmailAdapter.leerEventosNuevos(proveedorCampanaId, desde)` (implementa `TrackingPoll`): para cada
`threadId` guardado de mensajes enviados desde `desde`, consulta `users.threads.get` y detecta si
hay un mensaje nuevo en el hilo que **no** sea el que nosotros mandamos (por `from` distinto al de
la cuenta conectada). Se corre **por dueño** (cada usuario solo puede leer sus propios hilos, no
hay credencial de equipo) — el poll de tracking generalizado de `tarea Tracking` en `worker/index.ts`
pasa de "un solo proveedor de correo" a "un adaptador de correo por dueño con hilos activos",
mismo patrón de agrupar-por-dueño ya usado en Etapa 2.

### Rebotes (detección, nuevo)

Un rebote en Gmail no llega como respuesta del prospecto — llega como un mensaje del sistema
(`mailer-daemon@`, o un mensaje con `Content-Type: multipart/report`) en la bandeja del usuario
que mandó, correlacionado por el `messageId` original citado en el cuerpo del rebote. Detección:
al pollear, si un mensaje nuevo en la bandeja (no en el hilo original, Gmail separa rebotes del
hilo) viene de un remitente de sistema y cita el `messageId` enviado, se marca como evento
`rebotó`. Este es el punto más frágil de la etapa (parsear el formato de rebote no es un contrato
estable de Gmail) — se prueba contra un rebote real (mandar a una dirección inexistente a
propósito) antes de confiar en el parser.

### Testing (Etapa 3)

- Inyección de pixel/link: mismo HTML de salida para Gmail que para Apollo, dado el mismo cuerpo
  de entrada (test de snapshot/contrato compartido, no duplicar el caso por proveedor).
- `leerEventosNuevos` (Gmail): mock del cliente — hilo sin respuesta nueva → `[]`; hilo con
  respuesta del prospecto → evento `respondió`; error de un dueño no bloquea el poll de otro dueño.
- Detección de rebote: mock de un mensaje de `mailer-daemon` citando un `messageId` conocido →
  evento `rebotó`; mensaje de sistema que NO cita un `messageId` propio → se ignora (no falso
  positivo).
- **Prueba real**: correo de prueba con pixel (confirmar `abierto`), clic en un link (confirmar
  `clic`), responder desde el destinatario (confirmar `respondió`), mandar a una dirección
  inexistente (confirmar `rebotó`).

## Nota de reuso (para no duplicar entre Apollo y Gmail)

Dos piezas de lógica hoy viven "dentro" del adaptador de Apollo pero en realidad no son de Apollo:
la inyección de pixel/link en el cuerpo HTML, y la traducción `[nombre]` → merge-tag. Si Gmail
necesita la primera (sí) pero usa una sintaxis de variables distinta o ninguna (a confirmar en el
plan), extraer esa función a un helper compartido (`app/core/`) antes de escribir el adaptador de
Gmail — evita que cada proveedor nuevo reimplemente su propio inyector de tracking. Esto es
justamente el tipo de "problema existente que afecta el trabajo actual" que se arregla como parte
del diseño, no como refactor aparte.

## Fuera de alcance (v1)

- Cambiar de proveedor de Gmail a otro (no aplica, Gmail ES el proveedor nuevo).
- Multi-cuenta Gmail por usuario (una cuenta conectada por usuario, igual que WhatsApp hoy).
- Migrar campañas ya lanzadas por Apollo a Gmail a mitad de camino — el proveedor se fija al
  materializar cada paso, no se re-resuelve para pasos ya enviados.
- Programar el tope diario de forma dinámica por hora del día (throttle simple, no un scheduler
  fino) — si se necesita más adelante, es un cambio aislado dentro del adaptador de Gmail.
- Dashboard de salud de la cuenta Gmail (cuota consumida, tasa de rebote) — vive como
  responsabilidad futura, no bloquea v1.

## Criterio de éxito (por etapa)

- **Etapa 1**: Sebastián conecta su Gmail `@onepay.la` real desde `/conectores`, recibe el correo
  de verificación, confirma en la UI, el conector queda `Configurado`.
- **Etapa 2**: una campaña de prueba con 1 destinatario propio, dueño = Sebastián con Gmail
  verificado, se lanza, se aprueba explícitamente, y el correo llega **desde el Gmail de
  Sebastián**, no desde Apollo.
- **Etapa 3**: en ese mismo correo de prueba, `evento_tracking` registra `enviado`, `abierto`
  (al abrir), `clic` (al hacer clic en un link), y una prueba aparte a una dirección inexistente
  registra `rebotó`. Responder desde el destinatario de prueba registra `respondió`.
