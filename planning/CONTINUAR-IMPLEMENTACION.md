# Continuar la implementación · punto de entrada para la próxima sesión

Empieza AQUÍ. Este doc dice en qué estado quedó todo y qué archivos leer, en orden, para
retomar sin perder contexto. Última sesión: 2026-07-05.

## Lo último (2026-07-04, sesión de la tarde): Turso para el jefe + Fase 3 en pausa

A media tarea de diseñar el matcher de Fase 3 (ver más abajo), Sebastián pidió subir de
prioridad el deploy de la base a Turso para darle acceso de solo lectura a su jefe por MCP.
Se hizo, quedó funcionando, y el diseño del matcher se dejó a medias (ver sección siguiente).
Detalle completo de cómo se resolvió cada parte en la bitácora de `planeacion-ejecucion.md`;
aquí solo el estado y lo que falta.

**Turso: HECHO, con matices.**
- Base creada (`isps-onepay`, org de Sebastián, grupo `aws-us-east-1`), cargada con un dump
  de HOY de `isps.db` (1959 empresas, 213 contactos, 181 toques, 3247 alias, 1835 sync_cambios).
  Verificado byte a byte contra el local (ñ, tildes, dobles espacios, saltos de línea): idéntico.
- **Es una foto fija, NO queda en vivo.** La app y los scripts siguen escribiendo solo al
  archivo local. El jefe fue avisado explícitamente de que es "un primer vistazo, se pone
  100% en vivo esta semana" — no darlo por sentado como producción real sin refrescarlo.
- **Pendiente, si se quiere mantener fresco sin hacer el corte completo:** un script de
  "push" repetible (dry-run/apply, mismo patrón del proyecto) que vacíe y recargue las
  tablas de Turso desde `isps.db`, reusando la MISMA base/URL/token (para que el jefe no
  tenga que tocar su config de Claude cada vez). Tres niveles posibles, de menor a mayor
  esfuerzo: push manual bajo demanda, push automático por cron/launchd, o el corte completo
  a escritura en vivo (swap de `app/db/index.ts` + reescribir los scripts Python de
  migración/seed que hoy usan `sqlite3.connect()` directo — ninguno le habla a Turso).
  Nada de esto se construyó todavía, solo se dejó diseñado en la conversación.
- **Notas técnicas para quien retome esto:** el flag `--from-file` de `turso db create`
  reportó éxito pero NO importó nada (bug real del CLI, base quedó vacía). El fix fue
  generar un dump plano (`sqlite3 isps.db .dump`) y cargarlo con `turso db shell isps-onepay
  < dump.sql`. Ese dump usa `unistr('...')` para escapar saltos de línea (sqlite3 3.51+),
  que Turso no soporta — hubo que decodificarlo a string plano antes de cargar. El script
  que hace esa conversión no quedó en el repo (era un ajuste puntual de scratchpad); si se
  vuelve a necesitar (para el "push" repetible de arriba), hay que rehacerlo o pedírmelo.

**MCP para el jefe: EN PAUSA, sin resolver.**
- El paquete `mcp-turso` (nbbaier) tiene DOS bugs confirmados en vivo: (1) el bin de npm no
  trae shebang (`#!/usr/bin/env node`), así que `npx -y mcp-turso` lo ejecuta con bash en
  vez de node, y si hay ImageMagick instalado (como en la máquina de Sebastián) dispara su
  comando `import` por accidente; (2) aun cargándolo directo con `node` (saltándose el bug
  del shebang), se conecta bien a Turso pero se cae con un "Unhandled rejection" vacío justo
  después y se cierra solo. No es un problema de credenciales ni de la base — es el paquete.
- Decisión pendiente, NO tomada: (a) probar `mcp-turso-cloud` (spences10) — pide un token de
  API de TODA la organización de Turso, no solo esta base, más alcance del ideal; o
  (b) escribir un servidor MCP propio, chico (50-80 líneas), con el SDK oficial
  `@modelcontextprotocol/sdk` + `@libsql/client` — la recomendación en la mesa, dado que ya
  se descartaron dos bugs de un paquete de terceros. Retomar preguntando a Sebastián cuál
  prefiere antes de escribir código.

## Fase 3 (matcher de Granola): diseño a medias, NO tocar código todavía

Antes de la interrupción de Turso, se estaba refinando el algoritmo real del matcher/ingest
(V3.4 + V3.6 de `tasks-v2.md`) contra datos reales de Granola (verificados en vivo con el
conector MCP de Granola ya conectado). Decisiones YA confirmadas por Sebastián:

- **Teléfono manda siempre** sobre el nombre del título de Granola (se extrae de
  `private_notes` o, si no hay contacto conocido, del título mismo) para matchear contra
  `contacto.telefono`.
- **Bloques de 15 minutos:** sesiones del mismo teléfono separadas por menos de 15 min se
  agrupan como el mismo bloque de intentos de hoy (para no mezclar con la llamada de otro día).
- **Fusión a 1 hora:** dos sesiones CON contenido real del mismo teléfono a menos de 1 hora
  de diferencia se tratan como la MISMA llamada real partida por Granola en dos documentos —
  se fusionan en un solo toque, no dos (invariante: nunca dos toques por la misma sesión).

**Pregunta SIN responder, bloquea seguir con V3.4/V3.6:** cómo detectar que una sesión NO
tuvo contenido real (buzón de voz, no contestó). La data real muestra que Granola casi
nunca deja el campo `summary` literalmente vacío para llamadas fallidas — casi siempre
escribe un párrafo describiendo el fracaso (en español o inglés, sin patrón de texto fijo).
Recomendación dada, sin confirmar: tratar como "sin contenido" cualquier resumen que incluya
el pie de página en cursiva que Granola agrega cuando no hay conversación real ("*No hay
contenido que resumir*" / "*Granola es más útil con...*" o su equivalente en inglés), no
solo el placeholder literal "No summary".

**Actualización 2026-07-04, sesión siguiente: diseño del matcher CERRADO y `plan-fase3.md`
YA reescrito.** La pregunta del "vacío" quedó resuelta de raíz, no con un heurístico de
texto: el matching es on-demand, no de fondo. Se dispara solo cuando Sebastián registra un
toque `canal=llamada` con `resultado` en variante de "contestó" (`contesto_reunion`,
`contesto_sigue_seguimiento`, `contesto_no`); busca en Granola por teléfono del contacto en
una ventana de tiempo cerca del toque, agrupa candidatas (bloques de 15 min, fusión a 1
hora), y SIEMPRE pide confirmación de Sebastián antes de guardar el resumen — incluso con
una sola candidata obvia. `no_contesto` nunca toca Granola; si dejó correo de voz, va como
texto libre en `quePaso` (sin columna nueva). Consecuencia: no hace falta worker de fondo ni
tabla de candidatos pendientes para esto; el worker de V3.5 queda dedicado solo al drenado
de outbox a Notion. Detalle completo y el porqué de cada decisión en la sección "Decisión de
diseño" de `plan-fase3.md`, justo antes de la Tarea 0a. También se agregó una tarea nueva,
V3.9 (antes del cierre V3.10): un botón "agregar toque" independiente de la cola del día,
para contactos que no son leads — pedido explícito de Sebastián, dejado para el final a
propósito porque no bloquea nada del resto.

Con esto, ya se puede arrancar Fase 3 por `plan-fase3.md` en orden: Tarea 0a (mergear
`fase2-auth`) -> Tarea 0b (tour guiado) -> V3.1 -> V3.2 -> V3.3 -> V3.4 -> V3.5 -> V3.6 ->
V3.7 -> V3.8 -> V3.9 (toque independiente) -> V3.10 (cierre).

## Dónde estamos

- **Alcance v2 definido** (correo + cadencias + tracking + auth + conectores + IA sobre el plan).
- **Gate G0 CERRADO / VERDE:** se verificó en vivo contra la cuenta real de Apollo que el plan
  Professional habilita todo el CRUD de cadencia por API (crear secuencia, pasos, copy, editar
  copy, A/B, crear contactos en bloque, asignar a secuencia, frenar, archivar). El supuesto más
  riesgoso del plan se sostiene. Se puede construir.
- **Fase 1 (F0 cerrar el core) MERGEADA A MAIN.** El core ya no es el walking skeleton viejo:
  canal real del toque, las 4 salidas cerradas validadas con Zod dentro del Repository, KDM a
  `contacto`, tap de WhatsApp/correo, contadores del día. 8/8 tests y tsc limpios en main.
  Repo en github.com/SebastianAc02/followups_tool (main al día).
- **Fase 2 (Auth, B3) COMPLETA Y MERGEADA A MAIN** (commit `05f9d39`; este doc decía
  "SIN MERGEAR" pero eso ya estaba viejo — corregido 2026-07-05 al ejecutar la Tarea 0a de
  Fase 3: no había rama `fase2-auth` que mergear, main ya la tenía). Better Auth email+password,
  tablas generadas por su CLI en la misma isps.db, gate de sesión en toda página/action,
  owner sale de la sesión (ya no hardcodeado ni del form), flag admin. Refinamiento sobre B3
  (documentado como B1.c en plan-claude-v2.md): `empresa.owner` guarda nombres, no emails, y
  la mayoría de empresas (89%, verificado) no tiene owner individual porque son leads en
  frío; la atribución de una campaña masiva (Fase 4) será `campana.owner`, un concepto
  aparte. Solo Sebastián tiene cuenta real (admin=1); Felipe se agrega con
  `scripts/seed_auth_users.ts` cuando dé su email y password. 10/10 tests, tsc limpio,
  CodeRabbit corrido y con hallazgos resueltos o descartados con razón.

## Próxima acción

**Actualizada 2026-07-05 — diseño del matcher CERRADO, `plan-fase3.md` reescrito, Tarea 0a
CERRADA.** Todo lo pendiente de antes (pregunta del "vacío", reescribir V3.4/V3.6, mergear
`fase2-auth`) ya se hizo — ver "Lo último" y "Fase 3" arriba para el detalle completo.

**Lo único pendiente para arrancar Fase 3 de verdad:** Tarea 0b, el tour guiado (solo
lectura, 30-45 min, pedido explícito de Sebastián) por `app/db/schema.ts`,
`app/db/repository.ts`, el flujo completo de un toque, y las tablas de Better Auth — antes
de escribir una línea de código de Fase 3. Se dejó para la siguiente sesión a pedido de
Sebastián (2026-07-05, fin de sesión).

Después del tour, orden de ejecución por `plan-fase3.md`: V3.1 (migración conector+outbox)
-> V3.2 (cifrado AES-256-GCM) -> V3.3 (puerto TranscriptAdapter + GranolaAdapter) -> V3.4
(matcher de candidatas por teléfono + confirmación) -> V3.5 (worker, solo outbox) -> V3.6
(confirmación repetible) -> V3.7 (outbox a Notion) -> V3.8 (pantalla de conectores) -> V3.9
(toque independiente, feature nueva dejada para el final) -> V3.10 (cierre de fase).

**Nota de proceso:** en esta sesión salió feedback explícito de Sebastián sobre CÓMO
trabajar, no solo qué construir — ya está en CLAUDE.md ("Modo learning activo") y en la
memoria de la IA: mantener el formato de Insights/Tu código/checkpoints incluso cuando pide
ir rápido ("rápido" es apretar el loop de preguntas, no botar el formato).

Aparte, sin bloquear lo anterior: decidir el camino del MCP para el jefe (servidor propio
vs `mcp-turso-cloud`) cuando haya espacio para eso — no es parte de las 8 fases del roadmap
original, es infraestructura transversal que se coló por prioridad de negocio.

Detalle completo de cómo se ejecutó la Fase 2 (decisiones, fixes de review, verificación en
vivo con el navegador) en la bitácora de `planeacion-ejecucion.md`.

## Qué leer, en orden

1. **`CLAUDE.md`** (raíz) — la constitución. Reglas durables no negociables (puertos y
   adaptadores, acceso solo por Repository, canal/proveedor como dato, DB->Notion una vía, voz).
2. **`planning/funcionalidades-v2.md`** — el alcance completo: F0 a F8, el Anexo con las tablas
   nuevas propuestas, prerrequisitos. Es el QUÉ.
3. **`planning/plan-claude-v2.md`** — el plan de arquitectura e implementación: marco,
   decisiones de peso (B1.a, B1.b, B5, B6, B7 con por qué + alternativa + costo), y las 8 fases
   con demo, migraciones, pruebas y routing del orquestador. Es el CÓMO. (Resumen ejecutivo al
   final de este doc.)
4. **`planning/experimento-apollo.md`** — el contrato del adaptador de Apollo: endpoints exactos
   probados en vivo, trampas (header `X-Api-Key`, `add_contact_ids` pide el id en el cuerpo),
   límites (no hay DELETE por API), y lo pendiente (buzón/seat, envío real). Léelo antes de la
   Fase 5.
5. **`planning/planeacion-ejecucion.md`** — el tablero operativo vivo: gates, checklist de las
   8 fases, reglas de ejecución, bitácora. Se marca al cerrar cada paso.
6. **`planning/tasks-v2.md`** — la lista de tareas delegables a agentes (V1.1 a V7.3 + sueltas),
   generada pero NO ejecutada. Una por delegación; se marca al cerrar cada una.
7. **`app/db/schema.ts` + `app/db/repository.ts`** — lo que ya existe en código. La base real es
   `../isps.db` (un nivel arriba), 21 tablas; el schema Drizzle refleja 6. Reflejar las columnas
   reales que se usen.

Apoyo (no obligatorio cada sesión): `planning/hoja-plan-v2.md` (la hoja de criterio de
Sebastián), `planning/research-conectores.md` (research de Apollo/Granola/Lemlist), y las skills
`llamadas-onepay`, `notion-real-onepay`, `voz-onepay`, `bitacora-onepay`.

## Pendientes que NO bloquean construir

- **Limpieza en Apollo:** la secuencia `ZZZ-TEST-BORRAR-2026-07-03` sigue viva (inactiva, no
  manda). Limpieza = `remove_or_stop_contact_ids` + `archive`. Los 2 contactos son reales
  (Mailbox Sync desde mayo), NO se borran.
- **Decisión de negocio buzón/seat:** para enviar como Sebastián y no como Camilo. Se resuelve
  con Camilo, no en código.
- **Experimento Apollo más detallado (futuro):** envío real e2e, tracking poblando, sending
  schedules. Va antes de dar por cerrada la Fase 5, no antes de empezarla.
- **Pull Notion -> DB (nightly/semanal), pedido explícito de Sebastián (2026-07-05):** hoy
  `CLAUDE.md` dice "Fuera de v1: sync de dos vías" y eso sigue siendo cierto para lo que se
  construye en Fase 3 (V3.7 es DB -> Notion únicamente, vía outbox). Sebastián quiere,
  DESPUÉS, que Notion también pueble la DB de vuelta (una corrida nocturna o semanal). No se
  construye todavía porque él mismo marcó DB -> Notion como lo prioritario ahora. Cuando se
  retome: es un cambio real al invariante de la constitución, hay que actualizar `CLAUDE.md`
  a propósito (no como efecto colateral de una tarea), y pensar reconciliación (qué gana si
  DB y Notion cambiaron el mismo campo entre corridas).

## El criterio (si se retoma la skill criterion-plan)

Sebastián iba a llenar `planning/hoja-plan-v2.md` con SU plan sin releer plan-claude-v2.md, para
caminar el delta y construir criterio. Si se retoma: empezar por los deltas de mayor impacto
(B1.a dónde viven razón/objeción/KDM, B7 el worker de fondo, el orden de fases).

---

## Resumen ejecutivo del plan (copia del cierre de plan-claude-v2.md)

### Marco

1. **Problema:** los follow-ups por correo dependen de armar todo a mano en Apollo y leer
   tracking plano de MailSuite; se pierden toques y no hay dato estructurado. Para Sebastián y
   Felipe.
2. **Objetivo primario:** cero toques perdidos: cada toque del día queda visible, ejecutado y
   registrado como dato estructurado en isps.db.
3. **Fuera de alcance:** WhatsApp (F7), LinkedIn, envío automático de Tier 1 sin revisión, sync
   de dos vías, scoring.
4. **Criterios de aceptación:** uno por feature, tipo demo (ejemplo F1: "conecto Granola una vez
   y una reunión nueva aparece como toque con resumen sin que yo haga nada; la que no matchea
   cae en cola de revisión").
5. **Invariantes:** nunca dos toques por la misma sesión; nunca sale un Tier 1 sin revisión
   humana; nunca más de una inscripción activa por empresa; nunca credenciales en claro; Notion
   solo vía outbox; el core nunca importa adaptadores.
6. **Modos de fallo que preveo:** token de Granola vence en silencio; el reseed revienta contra
   los CHECK de estado; laptop apagado a la hora del envío; Apollo duplica contactos o gasta
   créditos; el matcher enlaza a la empresa EQUIVOCADA (peor que no enlazar); un manual email de
   Tier 1 atasca la cadencia semanas.
7. **Supuesto más riesgoso:** que la master key del plan Apollo Professional expone
   add-to-sequence y el tracking legible. (RESUELTO en G0: verdadero.)

### Decisiones que la hoja dejaba vivas

- **B1.a · F0.1:** dos columnas nuevas en `toque` (`razon_perdida`, `objecion`); las 4 salidas
  validadas en código (Zod + Repository), sin CHECK en DB. El KDM NO va en el toque: se
  crea/actualiza en `contacto` con `es_key_decision_maker=1` y el toque lo enlaza por
  `id_contacto`. Alternativa rechazada: tabla aparte y CHECK en DB. Costo: SQL a mano podría
  meter un resultado inválido; se acepta porque todo pasa por Repository.
- **B1.b · Destinatario default:** contactos con email en orden KDM > principal > primero con
  email. Si ninguno tiene email, la inscripción nace `bloqueada` y cae en la cola de revisión.
  Alternativa rechazada: excluirla del segmento o mandar a todos. Costo: un estado más.
- **B5 · Deuda con costuras:** WhatsApp/LinkedIn entran como `canal` dato; proveedor de envío
  detrás del puerto `EnvioAdapter` (Apollo es una implementación); eventos detrás del
  Repository; el "manual email" de Tier 1 es un flag del paso; Turso solo toca
  `app/db/index.ts`.
- **B6 · Fallos del envío:** sin lote transaccional; cada destinatario lleva su máquina de
  estados en `paso_inscripcion`; fallo a mitad de lote es reanudable con índice único +
  search-first (nunca duplica). Bounce -> `salio`. Manual email sin revisar: la cadencia ESPERA
  y se re-ancla a la fecha real. Respuesta tardía: pausa inmediata, ningún paso futuro sale.
- **B7 · Trabajo de fondo:** worker aparte (`npm run worker`, Node puro), 4 tareas secuenciales,
  catch-up-first, launchd al iniciar sesión, heartbeat en `conector`. Alternativas rechazadas:
  setInterval en Next, cron por tarea, VPS hoy. Costo: un proceso más; envíos esperan si el
  laptop está apagado.

### Las 8 fases (routing del orquestador: stack B siempre `api-patterns` + `database`;
`design-patterns` por adaptador; `qa-test-planner` antes de pruebas; `/code-review` cierra cada
fase; `ddd-architecture` se salta)

| Fase | Qué | Demo de cierre |
|---|---|---|
| 0 | P0 Apollo solo lectura (de-riesga supuesto #7) | ✅ HECHO. Contrato en experimento-apollo.md |
| 1 | F0 cerrar el core: ALTER a toque, 4 salidas, KDM a contacto, tap WhatsApp/correo, contadores | Registro "contestó-no" con razón Precio y el KDM queda en contacto |
| 2 | Auth (B3): Better Auth, owner=email, flag admin | Login de ambos; sin sesión no se ve nada |
| 3 | F1 conectores + ingest + outbox: tabla conector cifrada, worker B7, matcher a cola, idempotencia | Reunión real de Granola aparece como toque; una inventada cae en la cola |
| 4 | F3 sin envío: tablas grupo 1 y 2, import CSV/MD, segmentos, A/B, constructor calendario. Motor EN SECO | Subo mi cadencia, la veo por días, inscribo "on-hold", veo toques de mañana sin enviar |
| 5 | F3.5 + F4 envío y tracking: grupo 3, EnvioAdapter Apollo, poll de tracking, reply pausa, B6 | Cadencia real en segmento chico; una respuesta pausa sola |
| 6 | F5 + F6 IA: ClaudeAdapter vía Agent SDK, borrador -> aprobar -> outbox, evals antes de cerrar | Llega reunión y el borrador completo espera revisión |
| 7 | F2 panel admin: KPI de follow-ups perdidos/semana, métricas. Solo LEE | Entro como admin y veo el pulso de la semana |

**Por qué este orden:** Fase 0 mata el supuesto más riesgoso antes de construir encima; la deuda
F0 va primero porque las 4 salidas alimentan todo; auth antes de conectores; el motor de fechas
se depura en seco (Fase 4) antes de conectarle correos reales (Fase 5); la IA consume lo que el
ingest produce; el panel solo lee. Ninguna fase abre sin que la anterior cierre con demo,
pruebas y `/code-review`.
