# Funcionalidades v2 — lo que vamos a construir

Doc de alcance nuevo, más allá del walking skeleton actual. Arranque real: SOLO correo.
WhatsApp y llamada entran después, pero el modelo de datos se deja listo para ellos desde ya.

Cada feature: qué es, qué incluye, de qué depende, y las decisiones que quedan abiertas.
El orden es el de prioridad. F0 va de primeras porque es deuda del core que ya estaba
prometida y sin la cual lo demás no se sostiene.

Reglas heredadas de la constitución (no se rompen): el core no importa Granola/Notion/
Claude/driver de DB, todo entra por adaptadores; acceso a datos solo por Repository; canal
y proveedor de transcript son DATOS, no código; DB -> Notion es una sola vía con revisión
humana; textos para humanos en voz-onepay (sin emojis, sin em dashes, español directo).

---

## F0 · Cerrar el core de llamadas-onepay (deuda pendiente)

Lo que el spec/tasks originales ya prometían y todavía NO existe en código. Va primero
porque las campañas y el tracking se montan encima de esto.

- **F0.1 · Cerrar el toque bien (T6 a medias).** Hoy el canal está hardcodeado a "llamada"
  y el resultado solo distingue contestó/no-contestó.
  - Canal real del toque actual (llamada/WhatsApp/correo), no solo el del próximo.
  - Resultado con las 4 salidas del spec: contestó-reunión / contestó-sigo follow-up /
    contestó-no / no-contestó.
  - Capturar Razón de Pérdida en "contestó-no" (Wispro enfático: Razón = Precio).
  - Capturar KDM (nombre + tel) cuando el gatekeeper pasa el número del gerente.
  - Capturar objeción fuerte cuando el toque la trae (alimenta el corpus de objeciones).

- **F0.2 · Registrar toque de WhatsApp / correo con un tap (T9).** No existe. Un tap marca
  el toque por canal sin pasar por Granola (no hay sesión que pescar).

- **F0.3 · Métricas y pace (T13-T15).** No existe nada. Tablero del día por tipo
  (warm-reactivación / cold / follow-up post-reunión), connection rate, reuniones
  agendadas, # gerentes, desglose por canal, inbound vs outbound. Pace con ventanas
  (9:30-12, 14-16), meta diaria, checkpoints. (Esto se absorbe/expande en F2, el panel.)

Decisión abierta: F0.3 puede quedar cubierto por el panel central (F2) en vez de ser
pantalla aparte. Ver F2.

---

## F1 · Pantalla de conectores (captura automática)

Una pantalla donde conecto mis herramientas una vez y el sistema hace el resto solo.
Es el T7-T8 del plan original, ahora con UI propia.

- **F1.1 · Conectar Granola.** Pego/autorizo la credencial una vez; vive server-side.
- **F1.2 · Ingest automático de reuniones.** Cada vez que hay reunión, un worker la pesca
  de Granola, la enlaza a la empresa con el matcher (empresa_alias), trae el RESUMEN (no el
  transcript literal), y arma el toque.
- **F1.3 · Puntero en la base, no copia.** El toque queda apuntando: transcript_proveedor,
  transcript_id, transcript_url + resumen cacheado. La credencial la lee el server; el
  consumidor lee el cacheado sin credencial. (Columnas ya existen en el schema, hoy nadie
  las llena.)
- **F1.4 · Cola de revisión cuando el matcher no enlaza.** Reunión que no cae en ninguna
  cuenta no se inventa el match: queda en una cola para resolver a mano.
- **F1.5 · Sync a Notion.** Lo que se ingesta se sube a Notion por la vía única DB -> Notion
  (Outbox, idempotente, backoff, log en sync_cambios), con revisión humana antes de subir.

Estado de conectores por pantalla: cada uno muestra si está vivo, cuándo corrió por última
vez, y avisa si el token venció (que no se caiga en silencio por días).

### Modelo de fallos del ingest (B4, decidido)

Cada caso, qué hace el sistema:
- **Reunión que el matcher no logra enlazar a ninguna cuenta:** no se inventa el match. Cae
  en una cola de revisión (F1.4) para resolver a mano. El toque no se crea hasta enlazar.
- **Conector caído o token vencido:** la pantalla de conectores lo marca (estado + última
  corrida) y avisa; no se cae en silencio. La corrida siguiente reintenta.
- **Doble ingesta de la misma reunión (idempotencia):** la clave es el puntero
  (transcript_proveedor + transcript_id). Si ya existe un toque con ese par, no se crea otro;
  se actualiza el cacheado si cambió. Nunca dos toques por la misma sesión.
- **Proveedor trae transcript pero no resumen (o al revés):** se guarda lo que haya; el toque
  queda "sin resumen" o "sin transcript" pero no se rompe. El borrador de IA (F5) se marca
  para revisión, no se inventa.

### Outbox de Notion (F1.5, decidido)

Una sola vía DB -> Notion, nadie edita Notion a mano.
- Tabla `outbox`: la fila a sincronizar se escribe en la MISMA transacción que el cambio.
- Idempotente (no sube el mismo cambio dos veces), con backoff en reintentos.
- Falla de red: la fila queda pendiente en el outbox y se reintenta; el log va a sync_cambios.
- La IA NO sincroniza sus campos sin revisión humana previa (borrador -> aprobar -> outbox).

Decisión abierta menor: qué otros proveedores de transcript entran además de Granola (el
modelo ya los admite como dato). No bloquea.

---

## F2 · Panel central (administrador)

Una vista para ver el pulso del equipo, no para operar una llamada.

- Toques que está haciendo cada persona y en qué está ahora.
- Cuántos follow-ups se están perdiendo por semana (toques caídos, el KPI norte).
- Conteo por tipo y por canal, por persona y agregado.
- Connection rate, reuniones agendadas (día y acumulado), # gerentes conseguidos.

Absorbe el tablero de F0.3. Diferencia de altura: F0.3/tablero del día es para el que
opera; F2 es para ver a todo el equipo desde arriba.

Decisión abierta: esto asume multiusuario (varios owners, cada uno viendo o no lo de los
demás). Eso toca auth y el bloque B3 de la hoja de decisión, todavía sin llenar.

---

## F3 · Campañas y cadencias (el centro del alcance nuevo)

La razón de no hacerlo directo en Apollo: Apollo solo es correo y es enredado (crear
contactos, subir listas, todo a mano). Acá subo la cadencia completa UNA vez y la herramienta
la arma. Apollo queda como el motor de ENVÍO de correo por debajo; la herramienta es la dueña
de la cadencia.

### El modelo (esto cierra B1 y B2)

- **Cadencia** = la secuencia de toques (toque 1, toque 2, toque 3...). Es el TEMPLATE
  reutilizable, el "core". Cada toque trae: número de orden, canal, y un copy por defecto.
- **Toque / paso** = cada correo de la cadencia. Tiene su copy por defecto, pero se puede
  reemplazar por otra versión (ver F3.4). Un toque de correo es un paso de cadencia; cuando
  se manda o se registra el resultado, aterriza como fila de `toque` (la tabla que ya existe).
- **Campaña** = una cadencia aplicada a un SEGMENTO. "Outbound Tier 1", "Outbound Tier 2",
  "on-hold" son campañas distintas. Comparten el mismo core (la cadencia) pero cada una
  corre para su segmento y admite su personalización encima. Segmentado, cada cadencia va
  para su segmento, todo parte del mismo core.
- **Segmento** = un filtro guardado sobre nuestros contactos (tier / estado / on-hold).
- **Inscripción** = una EMPRESA metida en una campaña, con su posición en la cadencia. Regla:
  UNA campaña activa por empresa a la vez. Si un ISP pasa de on-hold a outbound Tier 1, sale
  de una y entra a otra (no corre dos cadencias en paralelo). Historial de inscripciones
  pasadas se guarda; activa solo hay una.
- **Destinatario** = cada CONTACTO de esa empresa al que le corre la cadencia. Puede ser uno
  (el gerente/KDM) o varios (opcional, cuando hay varios contactos). Los envíos y el tracking
  van por destinatario. Una respuesta de cualquier destinatario pausa la inscripción de la
  empresa (no se sigue tocando en frío a una empresa que ya enganchó). Dos niveles: empresa
  (una campaña activa) y contactos dentro (uno o varios).

### Las features

- **F3.1 · Segmentación tipo Clay sobre NUESTROS contactos.** Segmentar la base propia con
  lenguaje natural: "los que están en on-hold", "por estado", "Tier 1", "Tier tal que yo
  defino". Ir cortando la lista sobre lo que ya tenemos (tier1/2/3, on-hold, estado). Sin
  re-subir contactos: la base ya está en isps.db. El segmento se guarda y define la campaña.
- **F3.2 · Subir la cadencia una sola vez.** Yo ya hice el copy; subo el documento (CSV o
  Markdown) con los toques y la herramienta arma la cadencia template.
- **F3.3 · Preguntas de armado.** Al preparar, la herramienta pregunta: "¿personalizas algún
  correo?" -> "Tier 1 siempre personalizado", "los otros no, pero iterando". Iterar = si algo
  funcionó en la cadencia de un segmento, lo llevo a otro (Tier 2/3) y se actualiza en bloque.
- **F3.4 · Versiones del mismo toque (A/B test).** El toque 5 puede tener mi correo o el de
  otra persona: alguien puede decir "yo no quiero ese correo, quiero mandar otro". Se crean
  versiones colgadas del mismo paso de la cadencia, con su tracking separado.
- **F3.5 · Envío por Apollo (correo), la herramienta empuja.** La herramienta es dueña de la
  cadencia y empuja a Apollo: contactos propios por API (sin gastar créditos), agregar a
  secuencia, paso "manual email" para Tier 1 (revisión antes de enviar). WhatsApp/llamada/
  LinkedIn NO se automatizan: quedan como toques manuales en la cola del día (así lo pide el
  playbook).

- **F3.6 · Constructor de cadencia con vista de calendario (la interfaz de "revisa tu
  cadencia").** Yo le doy la cadencia y la herramienta me la muestra para revisar, por toque
  y por día:
  - Desglose por día: "día 1 mandas estos toques, día 2 estos, día 3 descanso, día 5 esto".
  - Configurar días sin envío (ej. domingo no se manda ni se hace nada).
  - Regla de corrimiento: si un toque cae en un día bloqueado, se pregunta si pasa al día
    siguiente o al anterior. (Esto ANDA junto con dia_offset del Anexo: la cadencia avanza
    por día relativo, y el corrimiento resuelve los días bloqueados.)
  - Preview final: un calendario que muestra "así se ve esta cadencia en acción", qué se
    manda/hace cada día. Nota de diseño: los calendarios normales quedan feos; este tiene
    que verse distinto, no el típico grid de mes.
  - La herramienta tiene que ser MUY versátil acá: la cadencia es data editable, no algo
    hardcodeado.

Pendiente de verificar en vivo (PRERREQUISITO, ver sección Prerrequisitos): qué endpoints
deja el plan Apollo Professional real de OnePay.

---

## F4 · Tracking (lo más importante, junto con F3)

El dolor concreto: MailSuite escupe un archivo plano y toca sacarlo y analizarlo aparte.
Acá el tracking es dato estructurado desde el primer momento.

- Muy sensible a: quién abrió el correo, quién lo vio, cuándo, cuántas veces.
- Delivered / opened / clicked / bounced / reply, legible por API (Apollo lo expone por
  master key, sin créditos), guardado en NUESTRA base, no en un CSV externo.
- Reply detection que frena la cadencia (y freno manual tras una llamada).
- Cero toques perdidos con visibilidad de atrasados.

Visión (cuando entren WhatsApp y llamada): el tracking unifica canales. Ver quién responde
por WhatsApp, quién por llamada, quién por correo, todo en un solo lugar. "Levantar mucha
data" -> hay que decidir dónde se almacena (ver F7).

---

## F5 · Autocompletar el "qué pasó" de la llamada desde el transcript

Al llenar lo que pasó en una llamada, que la herramienta coja el transcript y saque lo
importante sola, complementando la info de la cuenta. Yo solo reviso; si hay un error, lo
corrijo a mano. La captura es revisar, no escribir desde cero.

- Del resumen/transcript, la IA arma: Notas Discovery (solo facts), el "qué pasó" narrado
  humano (voz-onepay), el Brief, y propone próximo paso. Todo en borrador.
- La extracción la hace Claude sobre el plan (ver F6). El transcript/resumen ya viene de
  Granola (F1), así que la herramienta NO transcribe audio ella misma.

Sobre voz (evaluado y descartado como pieza técnica): Willow Voice NO tiene API pública ni
sirve para envolverse hacia el backend (es app de escritorio GUI, su valor es dictado para
un humano, no STT crudo por código). Si algún día se necesita transcribir audio por código
que Granola no cubra, la vía es una API STT real (Whisper / Deepgram / AssemblyAI), no
Willow. Para que Sebastián dicte a mano dentro de la herramienta, Willow-como-app sirve tal
cual, sin integración.

Decisión abierta: ninguna crítica. El "modelo pequeño" para extraer es Claude vía F6.

---

## F6 · Conexión con Claude sobre el plan (no API directa)

La IA de la herramienta corre sobre el gasto del PLAN de Claude, no sobre la API suelta,
porque se va a usar relativamente poco. El permiso legal ya está resuelto (revisado por los
abogados, con permiso de Anthropic); acá solo importa lo técnico.

Vía técnica: invocar a Claude a través del Claude Code / Agent SDK, que corre sobre la
suscripción en vez de consumir créditos de API por request. La herramienta llama al SDK como
un adaptador más (ClaudeAdapter), igual que Granola o Notion: el core no lo importa directo.

Alimenta F5 (extracción del transcript) y cualquier otra IA de la herramienta (armado de
borradores, iteración de copy).

---

## F7 · WhatsApp como canal de datos (etapa posterior)

No es para arranque. Cuando entre, no es envío masivo automático: es registrar la
conversación que YO ya llevo a mano con cuentas selectas (top tier), leyendo estado.

- Reporta qué me mandaron: si alguien escribió un mensaje, lo reporta; si no llegó, dice
  "no llegó"; si respondió, por dónde. Todo se guarda y se va updateando en Notion.
- Se integra al tracking unificado de F4 (responde por WhatsApp vs llamada vs correo).
- Vía técnica evaluada: cliente no oficial (open-wa, self-hosted) para LEER eventos de
  chats selectos, filtrando en nuestro código a solo la lista corta. Riesgo de bloqueo real
  pero bajo en uso 1:1 con contactos ya guardados. Envío masivo NO por esta vía.
- Si algún día el volumen de WhatsApp crece de verdad: líneas reales de operador (eSIM o
  física, POSPAGO para no perder el número), una línea fija por cohorte de cuentas (sharding,
  no rotar el número que ve un contacto), un dispositivo por línea, calentamiento gradual.
  El techo garantizado por escrito solo lo da la API oficial de WhatsApp Business (no
  evaluada aún).

---

## F8 · Storage de toda la data (transversal, no una pantalla)

Todo lo anterior levanta mucha data (tracking multicanal, eventos, respuestas). Dónde vive.

Decisión tomada: **misma base de datos (isps.db), tablas nuevas.** No se parte en dos DB
físicas.
- Por qué: el valor de F4 es joinear tracking con leads (evento -> paso_inscripcion ->
  inscripcion -> empresa por tier/estado). Dos DB separadas matan las foreign keys y los
  joins justo en la consulta que más importa. SQLite se traga cientos de leads/día sin
  problema de escala; separar por performance sería resolver un problema que no existe.
- Alternativa rechazada: dos bases (leads vs herramienta). Costo que evita: joins a mano en
  código, ATTACH frágil, cross-database limitado en Turso.
- Costo que se acepta: la tabla de eventos crece; se diseña append-only e indexada, y si un
  día pesa de verdad se mueve detrás del MISMO Repository sin tocar el core (la constitución
  ya deja esa costura).
- Fase 2: el salto a Turso (misma sintaxis Drizzle) mueve todas las tablas juntas.
- Los leads se reseedean desde Notion por upsert (no drop-and-recreate), así el reseed no
  toca la data operativa.

---

## Anexo · Tablas nuevas propuestas (borrador de B1)

Misma DB, tablas nuevas (F8). Convención del schema actual: snake_case en columna, camelCase
en TS, fechas como text ISO, booleanos integer 0/1. Las tablas maestras (empresa, contacto,
toque) NO se tocan; estas cuelgan de ellas.

Grupo 1 · La cadencia como template (F3):
- **cadencia**: id_cadencia (pk), nombre, descripcion, activa, created_at, updated_at.
- **paso_cadencia**: id_paso (pk), id_cadencia (fk), orden, dia_offset, canal, objetivo,
  created_at.
- **version_paso**: id_version (pk), id_paso (fk), nombre, asunto, cuerpo, es_default,
  activa, peso, created_at, updated_at. (El A/B cuelga del paso, no es template suelto.)

Grupo 2 · Campaña e inscripción (F3):
- **segmento**: id_segmento (pk), nombre, definicion (filtro compilado JSON),
  descripcion_natural, created_at, updated_at.
- **campana**: id_campana (pk), nombre, id_cadencia (fk), id_segmento (fk), estado, owner,
  created_at, updated_at.
- **inscripcion** (nivel EMPRESA): id_inscripcion (pk), id_campana (fk), id_empresa (fk),
  estado, paso_actual, fecha_inscripcion, fecha_fin, motivo_fin, created_at, updated_at.
  Regla: índice único parcial sobre id_empresa donde estado='activa' (una activa por empresa).
- **destinatario** (nivel CONTACTO, 1+ por inscripcion): id_destinatario (pk), id_inscripcion
  (fk), id_contacto (fk), estado (activo/respondio/salio), created_at. Una respuesta de
  cualquier destinatario pausa la inscripcion de la empresa.

Grupo 3 · Ejecución y tracking (F3.5 + F4):
- **paso_inscripcion** (el motor / "toques de hoy"): id_paso_inscripcion (pk), id_destinatario
  (fk), id_paso (fk), id_version (fk), id_toque (fk a toque, nullable), canal, proveedor,
  proveedor_mensaje_id (id de Apollo para cruzar tracking), estado, fecha_programada,
  fecha_enviada, created_at. Cuelga del destinatario (cada contacto tiene su envío y su
  tracking). Al ejecutarse materializa una fila en `toque` y la enlaza.
- **evento_tracking** (append-only, la única que crece): id_evento (pk), id_paso_inscripcion
  (fk), tipo, canal, proveedor_evento_id (idempotencia), detalle (JSON), fecha_evento,
  created_at. Solo INSERT; índices por id_paso_inscripcion y fecha_evento.

Fuera de este anexo (van con F1, no con campañas): tabla `conector` (credenciales cifradas,
estado, última corrida) y outbox de Notion (cola de pendientes; sync_cambios ya es el log).

Preguntas de modelado:
1. dia_offset (RESUELTO): la posición se calcula por DÍA relativo del playbook (0,1,4,7...).
   El constructor F3.6 maneja días bloqueados (ej. domingo) con regla de corrimiento (pasa
   al día siguiente o anterior). Falta detalle fino: si el worker no corre un día, ¿los
   toques atrasados se disparan juntos al reanudar o se re-escalonan? Decidir al construir
   F3.6.
2. Contactos por inscripcion (RESUELTO): varios contactos, opcional. Se modela en dos
   niveles: inscripcion (empresa, una activa) + destinatario (1+ contactos). La unicidad
   "una activa" queda a nivel empresa; los contactos cuelgan como destinatarios.

---

## Prerrequisitos (antes de construir F3/F4)

**P0 · Verificar Apollo en vivo, SOLO LECTURA.** Confirmar qué habilita la master key del
plan Professional real de OnePay antes de diseñar el envío. Restricción dura de Sebastián:
no dejar registro, no mandar nada, no editar nada, máximo cuidado.
- Qué SÍ se puede probar sin dejar rastro (endpoints de lectura, sin créditos): auth de la
  master key, `emailer_messages/search` (tracking), listar secuencias, listar buzones,
  usage stats. Esto confirma que el tracking (F4) es legible y que la key sirve.
- Tensión honesta: `create-contact` y `add-to-sequence` son ESCRITURA. No hay forma de
  verificarlos sin crear un registro. Con la regla de "no dejar registro", esos dos quedan
  como documentados-pero-no-probados hasta el día que se construya F3.5 de verdad, y ahí se
  prueban a propósito con un contacto de descarte que se borra. NO se prueban en esta pasada.
- Manejo de la key: no pegarla en el chat (queda en el historial). Mejor por variable de
  entorno o archivo gitignored, y se corren solo las llamadas de lectura. La autorización
  del conector MCP de Apollo va por sesión interactiva (claude.ai / `/mcp`), no por aquí.

## Lo que sigue abierto antes de tocar código

- B1 · Modelo de datos. Definido en F3 y bajado a tablas en el Anexo. Falta el detalle fino
  de dia_offset (toques atrasados) y confirmar el default de id_contacto. Luego, schema
  Drizzle real. Bloquea F3 y F4.
- B2 · Frontera envía-vs-registra. CERRADO: la herramienta es dueña de la cadencia y empuja
  a Apollo (correo); WhatsApp/llamada/LinkedIn manuales.
- B3 · Auth y credenciales multiusuario. RESUELTO (lo más fácil/rápido para este stack):
  - **Better Auth** con email + password. Es el estándar 2026 para Next.js + Drizzle +
    SQLite (Auth.js/NextAuth quedó en modo mantenimiento). Setup ~30 min, genera el schema
    solo por CLI, sesiones en cookie HTTP-only guardadas en la MISMA SQLite vía Drizzle, sin
    servicio externo, sin pago por usuario, data propia. Google OAuth se puede activar
    después con un toggle si se quiere, sin reescribir.
  - Usuarios el día 1: Sebastián y Felipe; crece a pocos más. La identidad = email = owner
    (la columna `owner` ya existe en empresa/toque).
  - Quién ve qué (v1, simple): todos los autenticados ven el pipeline compartido; la
    atribución es por owner. Un flag `admin` habilita el panel F2 (ver a todo el equipo).
    Se puede apretar a "cada quien solo lo suyo" después; no vale la pena en v1.
  - Credenciales de conectores (token Granola, key Apollo, etc.): cifradas en reposo con
    AES-256-GCM y una llave en variable de entorno (Node crypto, sin dependencia nueva);
    en la tabla `conector` se guarda el ciphertext, nunca la key en claro. Si la DB se
    filtra, sin la llave del entorno las credenciales no se leen.
- B4 · Modelo de fallos del ingest. CERRADO (ver F1: matcher sin enlace, token vencido, doble
  ingesta idempotente, transcript/resumen parcial) + outbox de Notion.
- B5 · Qué se difiere a propósito y qué costura se deja hoy. Sin escribir formal (es lo
  único del marco que queda; B1-B4 ya están resueltos arriba).

Diferido a propósito: LinkedIn (el playbook lo pide; se retoma después, sin dato técnico aún).
Falta pasar B2, B3 y B4 (ya cerrados aquí) a `planning/hoja-plan-v2.md` en formato de la hoja.
