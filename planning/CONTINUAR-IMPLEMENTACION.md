# Continuar la implementación · punto de entrada para la próxima sesión

Empieza AQUÍ. Este doc dice en qué estado quedó todo y qué archivos leer, en orden, para
retomar sin perder contexto. Última sesión: 2026-07-06.

## Lo último (2026-07-06): FASE 7 (PANEL ADMIN) COMPLETA, EN PARALELO A FASE 5

Sebastián pidió avanzar Fase 7 (F2 panel admin) en paralelo a Fase 5, que ya estaba en marcha
en otra sesión sobre el mismo repo. Para no interferir: worktree aislado
(`.worktrees/fase7-panel`, rama `fase7-panel` desde el tip de `fase4-cadencias`, que ya tiene
las tablas de cadencia que el panel necesita leer). El trabajo de Fase 5 sin commitear que
había en el directorio original (EnvioAdapter Apollo, migraciones f5_2/f5_4) NUNCA se tocó
desde este worktree. Brainstorming previo con Sebastián reformuló el norte del panel: de
"follow-ups perdidos/semana" (defensivo, el KPI original de F2) a throughput ofensivo — toques
ayer + promedio diario. Detalle en `spec-fase7-panel.md` y `plan-fase7.md`; bitácora completa
en `planeacion-ejecucion.md`.

- **La definición del promedio es de Sebastián, con constraint de tiempo explícito** (pidió
  terminar la fase de inicio a fin él mismo esta vez, excepción puntual al modo learning):
  ventana de 7 días HÁBILES hacia atrás, denominador fijo (nunca se diluye por fin de semana
  sin trabajar), pero un toque de sábado/domingo dentro del rango SÍ suma al numerador (bonus).
- **8 queries de solo lectura nuevas en el Repository, ninguna filtra por owner** (el panel es
  agregado, ve a todo el equipo). Reutilizan el patrón `substr(fecha,1,10)` de `contadoresHoy`
  (Fase 1): los 181 toques históricos de Notion con `fecha` tipo "June 25, 2026" quedan fuera
  de las ventanas del panel de forma natural y a propósito.
- **Ruta `/panel` gateada por `admin`.** Verificación en navegador bloqueada porque el harness
  detecta la sesión de Fase 5 ya corriendo un dev server sobre el mismo proyecto (bloqueo por
  identidad de repo, no de puerto; ajustar `launch.json` no lo destraba). Se verificó con
  `tsc --noEmit` limpio y lectura estática cuidadosa contra las queries reales en su lugar.
- **`/code-review` (CodeRabbit `--base fase4-cadencias`): 0 hallazgos.** 129/129 tests, tsc
  limpio. Rama `fase7-panel` en su propio worktree, sin mergear, lista para que Sebastián la
  revise. **Ojo al mergear:** nace de `fase4-cadencias`, no de `main` — coordinar el orden con
  el merge de Fase 4 y con lo que Fase 5 termine produciendo en esa misma rama base.
- **Diferido a propósito, no construido:** desglose "por persona" (`toque` no tiene owner
  directo; se filtraría por `empresa.owner`, vacío en el 89% de las empresas), tiles de
  envío/tracking (Fase 5) y de IA (Fase 6). Sin placeholders vacíos: se agregan cuando esas
  fases cierren.

## Lo anterior (2026-07-06): FASE 4 COMPLETA EN RAMA `fase4-cadencias` (V4.1 a V4.8)

Sesión straight-through: Sebastián pidió ejecutar TODA la Fase 4 (V4.1-V4.8) sin pausas de
learning (excepción puntual con constraint de tiempo, no cambio permanente de la regla de
CLAUDE.md; retomar learning normal en Fase 5 salvo que se repita la señal). Un commit por
tarea. 115/115 tests, tsc limpio, `/code-review` corrido. Rama SIN mergear, para revisión de
Sebastián (mismo patrón que fases anteriores). Detalle tarea por tarea en la bitácora de
`planeacion-ejecucion.md`; acá solo lo que un lector nuevo necesita:

- **El modelo de cadencias entero quedó EN SECO (no manda un solo correo).** 7 tablas nuevas
  (grupos 1 y 2 del Anexo), parser CSV/MD, segmentos como filtro compilado a JSON, A/B por
  peso, inscripción con destinatario default (B1.b), motor de fechas, y el constructor
  `/cadencias` con vista calendario. El envío real es Fase 5.
- **El motor de fechas (V4.6) es el corazón y quedó probado con 11 casos.** La decisión clave:
  cada paso se ancla en la fecha REAL del paso anterior, no en el cronograma absoluto. De ahí
  caen SOLOS el re-anclaje tras atraso y el anti-ráfaga (un worker caído nunca dispara los
  toques atrasados juntos): solo hay un paso debido a la vez.
- **Verificación real, no solo tests:** el constructor se probó en el navegador contra una
  COPIA de isps.db con usuario de prueba (bloquear domingo corre el toque al lunes o sábado en
  vivo). La demo de cierre (`scripts/demo_fase4.ts`) corre el flujo completo contra una copia:
  segmento on-hold real (126 empresas) -> 8 activas + 118 bloqueadas (la mayoría de leads en
  frío no tienen contacto con email) -> toques de mañana en seco.
- **`/code-review` (CodeRabbit): 6 hallazgos, 3 corregidos** (guard en la demo contra escribir
  a isps.db real, validación de peso en A/B, chequeo de que el contacto resuelto sea de la
  empresa), 2 descartados por precedente (ruta de DB hardcodeada; atomicidad de migración
  idempotente), 1 minor truncado en el pager que el cache incremental no re-listó (a
  re-verificar en un clon fresco si se quiere cerrar del todo).
- **isps.db real: solo se le aplicó la migración de V4.1 (las 7 tablas + índice).** Todo lo
  demás (cadencias demo, inscripciones, usuario de prueba) vivió en copias temporales; la base
  real quedó con 0 cadencias.

## Lo anterior (2026-07-06): FASE 3 CERRADA Y MERGEADA A MAIN (V3.1 a V3.10)

Sesión con constraint de tiempo fuerte de Sebastián: pidió avanzar sin pausas para que
escribiera código (solo V3.6 quedó con su parte real, el resto lo tomé yo con las
decisiones ya negociadas en un batch al principio). Toda la Fase 3 quedó cerrada en una
sola sesión, con verificación en vivo real (no solo tests) porque a mitad de camino
Sebastián compartió credenciales reales (Granola y su login) para destrabar la
verificación. Detalle tarea por tarea en `plan-fase3.md` (cada paso marcado); acá solo lo
que un lector nuevo necesita saber para seguir:

- **El matching de Granola se rediseñó a mitad de camino, verificado contra datos
  reales.** El plan original decía "teléfono manda siempre"; se probó contra el spec real
  de Granola (`docs.granola.ai/api-reference/openapi.json`) y contra notas reales de dos
  cuentas, y el teléfono NO es un campo estructurado en ningún endpoint (aparece a veces
  como texto libre en el resumen, no siempre). El diseño final: nombre de empresa/alias
  como término principal (con el sufijo legal quitado, ej. "digital coast s a s" ->
  "digital coast", porque Granola solo dice el nombre corto), teléfono como término extra
  cuando está.
- **3 bugs reales encontrados en vivo que ningún test hubiera atrapado**, más 7 hallazgos
  de `/code-review` (6 corregidos, ver commit V3.10): `FOLLOWUPS_CRYPTO_KEY` nunca estaba en
  `.env.local`, `page_size` real de Granola es 30 no 100, la paginación podía saltarse la
  ventana buscada si el equipo generó muchas notas nuevas después (faltaba `created_before`).
- **Credenciales expuestas en el chat de esta sesión, pendiente de Sebastián:** dos API keys
  de Granola (una de Thomas, una personal de Sebastián) y su password de la app quedaron
  escritas en el chat. Avisado dos veces en la sesión; falta que las rote.
- **Pendiente real para que Fase 3 funcione en producción de verdad (no bloquea Fase 4):**
  token de Notion + un script de enlace `empresa.notion_page_id` que nunca se construyó
  (hay 4 nombres de empresa duplicados reales, necesitan criterio humano para desambiguar,
  no se puede automatizar a ciegas). Sin esto el outbox no tiene a dónde escribir.
- **Verificación por clic remoto en el navegador tuvo fricción real** (varios intentos donde
  el clic no disparaba el action, sin causa clara identificada, no parece ser bug de la
  app). El ciclo completo botón→acción→Granola SÍ quedó probado de punta a punta, pero por
  el error 400 real que salió y se corrigió, no por un clic limpio con candidatas
  visibles en pantalla. Si se retoma esa verificación puntual, probar con más cuidado el
  timing (esperar hidratación completa antes de clic) o simplemente confiar en que ya
  quedó probado por otra vía.

## Lo anterior (2026-07-04, sesión de la tarde): Turso para el jefe + Fase 3 en pausa

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
- **Fase 2 (Auth, B3) COMPLETA Y MERGEADA A MAIN** (commit `05f9d39`). Better Auth
  email+password, tablas generadas por su CLI en la misma isps.db, gate de sesión en toda
  página/action, owner sale de la sesión (ya no hardcodeado ni del form), flag admin.
  Refinamiento sobre B3 (documentado como B1.c en plan-claude-v2.md): `empresa.owner` guarda
  nombres, no emails, y la mayoría de empresas (89%, verificado) no tiene owner individual
  porque son leads en frío; la atribución de una campaña masiva (Fase 4) será
  `campana.owner`, un concepto aparte. Solo Sebastián tiene cuenta real (admin=1); Felipe se
  agrega con `scripts/seed_auth_users.ts` cuando dé su email y password. 10/10 tests, tsc
  limpio, CodeRabbit corrido y con hallazgos resueltos o descartados con razón.
- **Fase 3 (F1 conectores + ingest Granola + outbox Notion) COMPLETA Y MERGEADA A MAIN
  (2026-07-06), V3.1 a V3.10.** Ver "Lo último" arriba para el resumen y `plan-fase3.md`
  para el detalle tarea por tarea. 53/53 tests, tsc limpio, `/code-review` corrido (7
  hallazgos, 6 corregidos). `UsuarioSesion` ahora incluye `id` (antes solo email/owner/admin).
- **Fase 4 (F3 sin envío: modelo de cadencias, motor EN SECO) COMPLETA EN RAMA
  `fase4-cadencias` (2026-07-06), V4.1 a V4.8, SIN MERGEAR.** Ver "Lo último" arriba. 7 tablas
  nuevas + índice único parcial, parser CSV/MD, segmentos a JSON, A/B por peso, inscripción con
  destinatario default (B1.b), motor de fechas (offsets/bloqueados/corrimiento/re-anclaje/
  anti-ráfaga), constructor `/cadencias`. Core nuevo: `app/core/cadencia-parser.ts`,
  `motor-cadencia.ts`, `inscripcion.ts`. 115/115 tests, `/code-review` corrido. Falta que
  Sebastián la revise y mergee.
- **Fase 5 (F3.5 + F4 envío por Apollo y tracking) EN PROGRESO, en otra sesión, sobre
  `fase4-cadencias`.** No se tocó desde este worktree. Al cerrar Fase 7 se observó en el
  directorio original (sin commitear): `app/adapters/apollo.ts` + `apollo.test.ts`,
  `app/core/ports/envio.ts`, migraciones `scripts/migrate_f5_2_*` y `migrate_f5_4_*`, y 2
  commits nuevos sobre reforma de dashboard/campañas. Estado real de avance: confirmar con
  Sebastián, esta nota es solo lo que quedó visible al pasar por ahí.
- **Fase 7 (F2 panel admin) COMPLETA EN WORKTREE `fase7-panel`, SIN MERGEAR.** Ver "Lo
  último" arriba. Nace de `fase4-cadencias`. 129/129 tests, `/code-review` con 0 hallazgos.

## Próxima acción

**Coordinar el orden de merge de tres ramas que cuelgan de `fase4-cadencias`:** la propia
`fase4-cadencias` (completa, sin mergear a main), Fase 5 (en progreso en otra sesión, sobre
esa misma rama) y `fase7-panel` (completa, en worktree aparte, también partiendo de
`fase4-cadencias`). Ninguna de las tres está en `main` todavía. Antes de mergear cualquiera,
revisar con Sebastián el estado real de Fase 5 (esta sesión no la tocó, solo la vio de pasada)
para no perder ese trabajo al reordenar ramas.

**`fase7-panel` está lista para revisión de Sebastián** (mismo patrón que las fases
anteriores): panel de actividad en `/panel`, 129/129 tests, `/code-review` con 0 hallazgos.
No requiere más trabajo salvo que la revisión encuentre algo.

**Cuando se retome Fase 5:** LEER `planning/experimento-apollo.md` ANTES (contrato del
adaptador, no negociable) si no se ha hecho ya. Tablas grupo 3 del Anexo (`paso_inscripcion`
con índice único id_destinatario+id_paso, `evento_tracking` append-only), `EnvioAdapter` con
implementación Apollo (header `X-Api-Key`, search-first por email, no hay DELETE), push
reanudable (B6, máquina de estados por destinatario), poll de tracking + reply detection que
pausa la inscripción. Gate G1 (escritura de Apollo e2e) se prueba DENTRO de la fase. Ver
`tasks-v2.md` para V5.1-V5.8. Nota: `agendaEnSeco` (V4.8) ya deja el motor listo para que
Fase 5 materialice `paso_inscripcion`; el bug del anchor (ISO datetime completo vs fecha) ya
está resuelto ahí.

**Retomar el modo learning normal en las próximas fases** (Insights + Tu código +
checkpoints) salvo que Sebastián repita la señal explícita de constraint de tiempo, como hizo
en Fase 3, Fase 4 y en la Tarea 1 de Fase 7.

**Pendientes sueltos (no bloquean Fase 5, pero conviene pronto):**
1. Rotar las dos API keys de Granola y el password que quedaron expuestos en el chat de la
   sesión de Fase 3.
2. Token de Notion + script de enlace `empresa.notion_page_id` (4 nombres duplicados reales
   necesitan criterio humano) — es lo que falta para que el outbox de Fase 3 escriba a Notion.
3. Buzón/seat con Camilo (identidad de envío como Sebastián, no Camilo): de negocio, solo
   bloquea la producción de Fase 5, no la construcción.

Aparte, sin bloquear lo anterior: decidir el camino del MCP para el jefe (servidor propio
vs `mcp-turso-cloud`) cuando haya espacio para eso — no es parte de las 8 fases del roadmap
original, es infraestructura transversal que se coló por prioridad de negocio.

**Nota de proceso:** la sesión de Fase 3 tuvo un constraint de tiempo fuerte; Sebastián pidió
explícitamente no seguir escribiendo el código él mismo (excepción puntual al modo learning
activo de CLAUDE.md, no un cambio permanente de la regla). Retomar el modo learning normal
(Insights + Tu código + checkpoints) en Fase 4 salvo que se repita la misma señal explícita.

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
