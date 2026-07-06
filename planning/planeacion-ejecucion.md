# Planeación de ejecución · followups-tool v2

Documento vivo. Desde aquí se ejecuta. Cada vez que se cierra un paso, se marca y se anota
en la bitácora. El plan de arquitectura completo vive en plan-claude-v2.md; este es el
tablero operativo: qué sigue AHORA, en qué orden, con qué gate.

Última actualización: 2026-07-04.

---

## Próxima acción (lo único que importa ahora mismo)

> **Arrancar Fase 5 (F3.5 + F4 envío por Apollo y tracking).** Fase 4 cerrada en la rama
> `fase4-cadencias` (2026-07-06), V4.1-V4.8, 115/115 tests, `/code-review` corrido. Leer
> `planning/experimento-apollo.md` ANTES (contrato del adaptador, no negociable). Tablas grupo
> 3 del Anexo (paso_inscripcion, evento_tracking), EnvioAdapter con implementación Apollo,
> push reanudable (B6), poll de tracking + reply detection. Gate G1 (escritura de Apollo e2e)
> se prueba DENTRO de la fase. Pendientes sueltos que NO bloquean: (a) rotar las dos API keys
> de Granola + password expuestas en el chat de Fase 3 (Sebastián); (b) token de Notion +
> enlace `empresa.notion_page_id` (para que el outbox de Fase 3 escriba de verdad); (c) buzón/
> seat con Camilo (identidad de envío, solo bloquea producción de Fase 5, no la construcción).

G0 cerrado el 2026-07-03: las 5 pruebas de lectura pasaron; `usage_stats` confirmó crear
contactos/empresas, add_contact_ids, gestionar/frenar secuencias y leer tracking. Y la prueba
en vivo confirmó que CREAR secuencias por API SÍ funciona en Professional (lo que Sebastián
quería automatizar; corrige la salvedad previa). Residuo: dos borradores de prueba quedaron
archivados (el plan no tiene DELETE de secuencias); si se quieren borrar, a mano en Archived.
Detalle e incidente en experimento-apollo.md.

---

## Gates (barreras que no se cruzan sin cumplirse)

- **G0 · Apollo verificado (SOLO LECTURA). ✅ VERDE (2026-07-03).** Las 5 pruebas pasaron;
  usage_stats confirmó los endpoints de escritura habilitados sin escribir nada. Salvedad:
  sequences/create por API no habilitado (shell se crea en UI). Bloqueaba Fase 5; liberado.
- **G1 · Escritura de Apollo probada** (create-contact + add-to-sequence con contacto de
  descarte que se borra). Ocurre AL construir Fase 5, no antes. Bloquea el envío real.
- **G2 · Agent SDK headless probado.** Que el ClaudeAdapter corra sobre el plan sin sesión
  interactiva. Bloquea Fase 6; plan B es API con presupuesto chico (el puerto no cambia).

Regla: un gate rojo detiene solo lo que depende de él. Las fases independientes siguen.

---

## Secuencia de fases (marcar al cerrar; cada una cierra con demo + pruebas + /code-review)

- [x] **Fase 0 · P0 Apollo (G0). ✅** Solo lectura. Corrido 2026-07-03: G0 verde, supuesto
      sostenido. Resultados y decisión en experimento-apollo.md.
- [x] **Fase 1 · F0 cerrar el core. ✅ MERGEADA A MAIN (2026-07-04).** ALTER a `toque`
      (razon_perdida, objecion), 4 salidas validadas con Zod dentro del Repository, KDM a
      `contacto` (upsert por empresa+teléfono), canal real del toque, tap de WhatsApp/correo
      desde la cola, contadores del día por canal/resultado. Migración con dry-run + apply.
      Demo verificada en vivo contra isps.db real (con limpieza posterior): "no sigue" con
      razón Precio y el KDM queda en contacto. 8/8 tests, CodeRabbit 0 hallazgos. Merge
      fast-forward sin conflictos; rama `fase-1-cerrar-el-core` borrada.
- [x] **Fase 2 · Auth (B3). ✅ COMPLETA EN RAMA `fase2-auth` (2026-07-04), sin mergear.**
      Better Auth email+password, tablas generadas por su CLI en la misma isps.db, gate de
      sesión (`requireSession()`) en toda página y todo server action, owner de la sesión
      (ya no del formulario ni hardcodeado), flag admin. Refinamiento de B3 (documentado como
      B1.c en plan-claude-v2.md): owner=email no aplicaba porque `empresa.owner` guarda
      nombres, no emails; se agregó un campo `owner` propio en la tabla `user` con ese
      mapeo. Demo verificada en vivo: sin sesión `/` y `/llamada/[id]` redirigen a `/login`;
      login real de Sebastián (admin=1) entra y ve su cola; password incorrecto muestra error
      sin trabar el botón; "Salir" cierra sesión; signup por API deshabilitado. Felipe
      pendiente de sus datos (no bloquea). 10/10 tests, CodeRabbit 2 hallazgos reales
      corregidos (catch de red en login, cierre garantizado de DB en el script de seed) y 1
      descartado (ruta de DB hardcodeada: mismo patrón ya aceptado en Fase 1).
- [x] **Fase 3 · F1 conectores + ingest Granola + outbox Notion. ✅ MERGEADA A MAIN (2026-07-06),
      V3.1 a V3.9 cerradas.** Tabla `conector` (AES-256-GCM, personal para Granola vía
      `idUsuario`, global para Notion), tabla `outbox`, worker (B7) con heartbeat y
      catch-up-first, GranolaAdapter + puerto `TranscriptAdapter`, matcher on-demand
      (`agruparCandidatas`) disparado al confirmar un toque `contesto_*` (rediseñado: el
      matching original por teléfono no sobrevivió al dato real, quedó por nombre de
      empresa/alias + teléfono como término extra), `NotionAdapter` + puerto `SyncAdapter`
      con backoff, pantalla `/conectores`, toque independiente `/toque-independiente`.
      Verificado con sesión real de Sebastián (no simulada): guardado cifrado confirmado en
      la DB real, 3 bugs reales encontrados y corregidos en el camino (env var de cifrado
      faltante, `page_size` real de Granola es 30 no 100, nombre de empresa necesita quitar
      sufijo legal para matchear). 52/52 tests, tsc limpio. `/code-review` corrido, hallazgos
      en la bitácora abajo. Pendiente real (no bloquea Fase 4): token de Notion + script de
      enlace `empresa.notion_page_id` (hay 4 nombres duplicados reales, necesita criterio
      humano). Detalle completo en `plan-fase3.md`.
- [x] **Fase 4 · F3 sin envío. ✅ COMPLETA EN RAMA `fase4-cadencias` (2026-07-06), V4.1 a V4.8.**
      7 tablas nuevas (grupos 1 y 2 del Anexo) con índice único parcial `ux_inscripcion_activa`
      (una activa por empresa; bloqueadas/finalizadas no cuentan). Parser de cadencias CSV/MD
      puro + Repository (`crearCadencia`, versión default por paso). Segmentos como DSL cerrado
      a JSON (no SQL libre; whitelist campo->columna; verificado on-hold = 126 vs SQL a mano).
      A/B por peso con reparto determinista. Inscripción con destinatario default B1.b (KDM >
      principal > primero con email; sin email nace bloqueada). Motor de fechas EN SECO (la
      prueba más densa): offsets, días bloqueados, corrimiento bidireccional, re-anclaje a la
      fecha real (anti-ráfaga por construcción). Constructor `/cadencias` con calendario que
      corre el motor en el cliente (verificado en navegador con copia de isps.db). Demo de
      cierre end-to-end contra copia: cadencia real, on-hold 126 -> 8 activas + 118 bloqueadas,
      una activa por empresa con historial, toques de mañana en seco. 115/115 tests, tsc limpio,
      `/code-review` con 6 hallazgos (3 corregidos, 2 descartados por precedente, 1 minor
      truncado en el pager y no re-listado por el cache incremental). Detalle en la bitácora.
- [ ] **Fase 5 · F3.5 + F4 (requiere G0 verde, y prueba G1 dentro).** Tablas grupo 3
      (paso_inscripcion, evento_tracking), EnvioAdapter con implementación Apollo, poll de
      tracking, reply detection que pausa, B6 completo. Demo: cadencia real en segmento chico;
      una respuesta pausa la inscripción sola.
- [ ] **Fase 6 · F5 + F6 IA (prueba G2 dentro).** ClaudeAdapter vía Agent SDK, extracción de
      borradores, flujo borrador -> aprobar -> outbox. Evals en evals.md antes de darla por
      lista. Demo: llega reunión y el borrador completo espera revisión.
- [ ] **Fase 7 · F2 panel admin.** KPI de follow-ups perdidos/semana, métricas de equipo,
      flag admin. Solo lee. Demo: entro como admin y veo el pulso de la semana.

---

## Reglas de ejecución (heredadas; se cumplen en cada fase)

De la constitución: el core no importa Granola/Notion/Claude/Apollo/driver de DB (todo por
puertos); acceso a datos solo por Repository; `canal` y `transcript_proveedor` son DATOS;
DB -> Notion una sola vía con revisión humana; textos para humanos en voz-onepay; una tarea
de tasks.md por delegación, diff pequeño; una feature no está lista sin sus pruebas.

Del orquestador (stack B, JS/Next): cada fase de backend corre `api-patterns` + `database`
(nunca los de Laravel); `design-patterns` al crear cada adaptador nuevo; `qa-test-planner`
antes de escribir pruebas; `testing` genérico; `/code-review` como gate de cierre de CADA
fase. Frontend arranca con `taste-skill`; superficies nuevas grandes (el calendario de F4, el
panel de F7) suman `impeccable` + `frontend-design`. `ddd-architecture` se salta (es Vue/Nuxt;
las fronteras ya están fijadas por la constitución).

---

## Decisiones abiertas que se resuelven al llegar a su fase (no ahora)

- Toques atrasados cuando el worker no corrió un día: se re-anclan a la fecha real de envío
  (decidido en B6). Detalle fino del re-escalonado: se cierra al construir F3.6 (Fase 4).
- Segmentación por lenguaje natural (F3.1 estilo Clay): v1 es UI de filtros (Fase 4); el
  lenguaje natural llega apoyado en el ClaudeAdapter (Fase 6).
- Qué otros proveedores de transcript además de Granola: el modelo ya los admite como dato;
  no bloquea nada, se agregan cuando haya uno real.

---

## Bitácora

- 2026-07-03 · Diseñado el experimento P0 (experimento-apollo.md) y el script de sondeo
  read-only (scripts/apollo_probe.py). Verificados contra docs.apollo.io los 4 endpoints de
  lectura (email_accounts, emailer_campaigns/search, emailer_messages/search, usage_stats):
  todos master key, 0 créditos. Header real confirmado `X-Api-Key` (los docs dicen Bearer; el
  script prueba ambos).
- 2026-07-03 · Corrido P0 con la key master real. Las 5 pruebas 200. usage_stats enumera 70
  endpoints habilitados; entre ellos contacts/create, contacts/bulk_create,
  emailer_campaigns/add_contact_ids/approve/abort/archive/remove_or_stop, accounts/create,
  fields/create, tasks/create, phone_calls/create — todos cuota 2000/día, consumed 0.
  Confirmadas las escrituras de la feature SIN escribir nada. Rate limit 200/min, 400/h,
  2000/día. **Gate G0 verde.**
- 2026-07-03 · Probado en vivo que CREAR secuencias por API funciona en Professional
  (`POST /sequences` y `/emailer_campaigns` -> 200). Habilita el modelo "la herramienta sube
  el copy por API", que es lo que se quería automatizar. Incidente: el probe de cuerpo vacío
  creó 2 borradores en vez de dar 422; se archivaron (el plan no expone DELETE, solo archive);
  lista activa de vuelta en 10. Para borrarlos del todo: manual en la vista Archived de Apollo.
  Pendiente Fase 5: confirmar subida de copy por API y create-contact+add_contact_ids e2e.
- 2026-07-03 · Verificado EN VIVO todo el CRUD de cadencia por API: crear secuencia, paso,
  copy, editar copy, A/B (2 variantes en un paso), bulk_create contactos (dedup), asignar a
  secuencia (add_contact_ids exige emailer_campaign_id en cuerpo + mailbox id), y que sin
  aprobar no envía. Límites: no hay DELETE por API (solo archive/remove); identidad de envío =
  buzón vinculado (hoy solo los de Camilo, 1 seat) -> decisión buzón/seat pendiente, no bloquea.
  Consolidado en experimento-apollo.md como contrato del adaptador. G0 cerrado del todo.
  Artefactos de prueba quedan en Apollo (inactivos, no mandan); limpieza opcional.
- 2026-07-03 · Cierre de sesión. Creado planning/CONTINUAR-IMPLEMENTACION.md como punto de
  entrada para la próxima sesión (estado + qué leer en orden + próxima acción = Fase 1).
  Descubierto que los 2 contactos de la prueba son reales (Mailbox Sync desde mayo), no se
  borran. Pendientes que no bloquean: limpieza de la secuencia de prueba, decisión buzón/seat.
- 2026-07-03 · Generada planning/tasks-v2.md: la lista completa de tareas delegables a
  agentes (V1.1 a V7.3 por fase + S1/S2 sueltas), cada una con archivos, routing de skills y
  "lista cuando". Verificado contra isps.db que contacto ya tiene es_key_decision_maker y
  cargo_categoria, y que a toque le faltan razon_perdida y objecion (el ALTER de V1.1 es
  real). NINGUNA tarea ejecutada; se retoma por V1.1 cuando Sebastián dé el arranque.
- 2026-07-03 · Ejecutada la Fase 1 completa (V1.1 a V1.6) vía subagent-driven-development:
  un implementador + revisión de spec compliance + revisión de calidad por tarea, con fix y
  re-verificación cuando el reviewer encontró issues. Repo conectado a
  github.com/SebastianAc02/followups_tool (no existía remote antes). Walking skeleton
  commiteado en main (818e541); la Fase 1 vive en la rama `fase-1-cerrar-el-core`.
  - V1.1: ALTER a toque (razon_perdida, objecion), idempotente por PRAGMA, no por captura de
    excepción. Aprobado sin issues.
  - V1.2: registrarToque con Zod dentro del Repository (no solo la UI), enum cerrado de 4
    salidas, upsert de KDM por empresa+teléfono en la misma transacción. Fix tras review:
    normalización de telefono="" movida al schema de dominio, drift de test-helpers.ts vs
    schema.ts corregido. Hallazgo falso (no bug real): PRAGMA table_info no mostraba
    usuarios_efectivos por ser columna GENERATED STORED en isps.db; confirmado con
    `.schema` que sí existe y el diseño es correcto.
  - V1.3: UI real de las 4 salidas, razón condicional, objeción, KDM. Placeholder temporal
    de V1.2 removido. Fix tras review: rename canal->proximoCanal en CaptureForm para
    claridad (sin cambio de comportamiento).
  - V1.4: tap de WhatsApp/correo desde la cola (resultado fijo no_contesto, decisión
    confirmada con Sebastián). Reestructuración de la fila (Link + form hermanos, nunca
    anidados) para no romper HTML. Aprobado sin fixes.
  - V1.5: contadoresHoy (por canal y por resultado), alcance acotado a propósito sin
    inventar taxonomía warm/cold/reactivación (eso es Fase 7). Fix tras review: documentado
    y testeado el comportamiento con datos legado (total incluye, buckets no).
  - V1.6: cierre de fase. Instalado y autenticado CodeRabbit CLI (no estaba disponible).
    2 hallazgos reales: ruta de DB hardcodeada en scripts de migración (ahora lee
    ISPS_DB_PATH) y bug de zona horaria en el cálculo de "mañana" (mezclaba hora local con
    UTC vía toISOString; nuevo app/lib/date-utils.ts corrige esto en ambos lugares que lo
    tenían). Re-corrida de CodeRabbit: 0 hallazgos. 8/8 tests. Rama dejada sin mergear a
    pedido de Sebastián, para que la revise localmente primero.
- 2026-07-04 · Mergeada Fase 1 a main: fast-forward limpio (818e541..d9777e2), sin
  conflictos. Verificado 8/8 tests + tsc en main post-merge. Push a origin/main, rama
  `fase-1-cerrar-el-core` borrada local y remota. Próxima acción: Fase 2 (Auth), empezando
  por V2.1.
- 2026-07-04 · Antes de arrancar Fase 2, Sebastián planteó que la gran mayoría de empresas
  (verificado: 1737/1959, 89%) no tiene `owner` individual (frío nunca tocado), y que la
  atribución de una campaña masiva (Fase 4) es la campaña misma, no una persona por empresa.
  Documentado como B1.c en plan-claude-v2.md: `empresa.owner` (persona, hoy) y
  `campana.owner` (campaña, Fase 4) son dos niveles distintos; no bloquea Fase 2, la cola
  personal sigue igual. Guardado como memoria de proyecto para no perderlo entre sesiones.
- 2026-07-04 · Ejecutada la Fase 2 completa (V2.1 a V2.4) inline, sesión a sesión con
  checkpoint (sin subagentes, a pedido de Sebastián), en la rama `fase2-auth`:
  - V2.1: `npm install better-auth`; `app/lib/auth.ts` (email+password, `disableSignUp`
    salvo `ALLOW_SIGNUP=1`, additionalFields `owner`/`admin` con `input:false`). Schema
    generado con `npx @better-auth/cli generate` -> `app/db/auth-schema.ts`, mergeado en
    `app/db/index.ts`. DDL de las 4 tablas (user/session/account/verification) generado con
    `drizzle-kit generate` contra un config temporal apuntando a auth-schema.ts (no
    transcrito a mano, para no arriesgar un NOT NULL o DEFAULT mal copiado) y pegado
    verbatim en `scripts/migrate_auth_apply.py` (+ `_dryrun.py`), mismo patrón dry-run+apply
    de F0. Verificado en isps.db real: apply corrido dos veces, idempotente. Server arranca
    y `/api/auth/ok` responde `{"ok":true}` (verificado con el navegador de preview).
  - V2.2: `app/lib/session-user.ts` (mapeo puro sesión->{email,owner,admin}, TDD, 2 tests
    nuevos, 10/10 en total) + `app/lib/session.ts` (`requireSession()`, redirect a `/login`
    sin sesión) + pantalla de login (`app/login/`, CSS a mano siguiendo las variables de
    globals.css, sin Tailwind) + `SignOutButton`. Gate agregado a `page.tsx`,
    `llamada/[id]/page.tsx` y sus server actions; owner ya no viene del `<input hidden>` del
    form sino de la sesión; "Repartir" solo se muestra si estás viendo tu propia cola.
    Verificado en vivo: sin sesión, `/` y `/llamada/x` redirigen a `/login` (fetch con
    redirect:follow confirmado en consola del navegador).
  - V2.3: `scripts/seed_auth_users.ts`. Sebastián dio el password directo en el chat; se
    corrió con `ALLOW_SIGNUP=1` solo para ese proceso puntual (el server sigue con signup
    deshabilitado, confirmado con un POST directo a `/api/auth/sign-up/email` que devuelve
    `EMAIL_PASSWORD_SIGN_UP_DISABLED`). Verificado en isps.db: fila de Sebastián con
    admin=1. Login real en el navegador: entra, ve su cola (26 hoy / 26 vencidos), "Salir"
    cierra sesión y vuelve a `/login`. Felipe no tenía datos listos; se deja para cuando los
    dé, con el mismo script (no bloquea el cierre de fase).
  - V2.4: CodeRabbit (`--base main`) encontró 3 hallazgos. 2 reales corregidos: LoginForm no
    tenía try/catch (un error de red dejaba el botón en "Entrando..." para siempre, sin
    mensaje) y `seed_auth_users.ts` no garantizaba `db.close()` ni salía con código de error
    si algo fallaba a mitad de camino. 1 descartado: ruta de DB hardcodeada en los scripts
    nuevos, porque sigue EXACTAMENTE el patrón que quedó aceptado en el cierre de Fase 1
    (commit c2abd80: env var + mismo fallback, igual que app/db/index.ts). Re-verificado en
    el navegador: password incorrecto muestra error sin trabar el botón; password correcto
    entra normal. 10/10 tests, tsc limpio. Rama `fase2-auth` dejada sin mergear (mismo
    patrón que Fase 1: Sebastián la revisa localmente primero). Próxima acción: Fase 3
    (conectores + ingest Granola + outbox Notion), empezando por V3.1.

- **2026-07-06 · Fase 4 (F3 sin envío) COMPLETA en rama `fase4-cadencias`.** Sesión
  straight-through (Sebastián eligió ejecutar V4.1-V4.8 sin pausas de learning, excepción
  puntual con constraint de tiempo, no cambio permanente de la regla de CLAUDE.md). Un commit
  por tarea, diff pequeño.
  - V4.1: `scripts/migrate_f3_*.py` (dry-run + apply, idempotente) crea 7 tablas del Anexo
    (cadencia, paso_cadencia, version_paso, segmento, campana, inscripcion, destinatario) + el
    índice único parcial `ux_inscripcion_activa` (`WHERE estado='activa'`). Aplicado a isps.db
    real, verificado que rechaza la segunda activa y deja convivir bloqueada/finalizada.
    Reflejado en schema.ts y test-helpers.ts. Nota: el `git add -A` de este commit arrastró
    sin querer el cambio pre-existente de CLAUDE.md (la sección "Modo learning activo" que
    Sebastián ya tenía sin commitear); es contenido legítimo, solo aterrizó en un commit ajeno.
  - V4.2: parser puro `app/core/cadencia-parser.ts` (CSV con comillas/multilínea RFC-4180,
    Markdown por día/canal/asunto, orden inferido). Validación de dominio con Zod en el
    Repository (`cadenciaParseadaSchema`), no en el core. `crearCadencia` crea una version_paso
    default por paso (el copy vive en la versión, no en el paso).
  - V4.3: segmentos como DSL cerrado a JSON en `segmento.definicion` (condiciones
    `{campo,op,valores}` ANDeadas; campo de whitelist de dominio que el Repository mapea a
    columnas reales; valores parametrizados; NO SQL libre). Verificado en vivo contra COPIA de
    isps.db: segmento on-hold devuelve 126, igual al conteo SQL a mano.
  - V4.4: A/B por peso. Reparto DETERMINISTA (`app/core/motor-cadencia.ts`, bucketing por
    índice mod pesoTotal, sin Math.random). `agregarVersionPaso` cuelga una versión nueva y
    apaga el default anterior en la misma transacción (iterar = agregar, no editar la enviada).
  - V4.5: inscripción + destinatario default (B1.b). Selector puro `app/core/inscripcion.ts`
    (KDM > principal > primero con email; sin email -> null -> bloqueada). `inscribirCampana`
    cierra la activa anterior con `motivo_fin` ANTES de abrir la nueva, en una transacción, así
    el índice nunca ve dos activas. Idempotente al re-correr. Cubre los 4 defaults + cambio de
    campaña con historial.
  - V4.6 (la prueba más densa): motor de fechas EN SECO, puro. `calcularCalendario` (plan
    ideal: anchor+offset corrido fuera de días bloqueados) y `proximoPasoDebido` (el corazón:
    ancla cada paso en la fecha REAL del anterior, no en el cronograma absoluto). Anti-ráfaga y
    re-anclaje CAEN SOLOS de esa decisión: solo hay un paso debido a la vez, un worker caído 10
    días dispara uno, no los atrasados en ráfaga. 11 casos (offsets, corrimiento en ambas
    direcciones, semana bloqueada lanza, re-anclaje, anti-ráfaga). Fechas de julio 2026
    verificadas (07-12 domingo).
  - V4.7: constructor `/cadencias` (sin Tailwind, patrón globals.css). Import CSV/MD por server
    action; el motor corre EN EL CLIENTE (es puro) para previsualizar en vivo: línea de tiempo
    por día (no grid de mes), días sin envío configurables, regla de corrimiento, anotación
    "corrido de X". Verificado en el navegador contra una COPIA de isps.db con usuario de
    prueba (test@local.dev, seed en la copia, launch.json con env temporal ya restaurado):
    bloquear domingo corre el toque de día 6 a lunes (siguiente) o sábado (anterior),
    recalculando al instante. Link agregado en el nav del home.
  - V4.8: puente `agendaEnSeco` (motor aplicado a inscripciones activas reales, sin materializar
    ni enviar; fix real de camino: `fecha_inscripcion` es ISO datetime completo, se recorta a
    fecha para el motor, mismo bug evitado en Fase 5). `scripts/demo_fase4.ts` corre el flujo
    completo end-to-end contra una copia: cadencia real -> on-hold 126 -> 8 activas + 118
    bloqueadas (la mayoría de leads on-hold en frío no tienen contacto con email) -> una activa
    por empresa con historial -> toques de mañana en seco. `/code-review` (CodeRabbit `--base
    main`): 6 hallazgos. 3 corregidos: guard duro en la demo contra escribir a isps.db real,
    validación de `peso` en `actualizarVersionPaso`, y `resolverInscripcionBloqueada` ahora
    verifica que el contacto pertenezca a la empresa. 2 descartados por precedente (ruta de DB
    hardcodeada en migraciones, ya aceptado en Fase 1/2; atomicidad de la migración, idempotente
    por `IF NOT EXISTS` y mismo patrón que f0/f1/auth). Aparte, endurecí el coercer numérico de
    segmentos (un valor no numérico para `prioridad` fallaba en silencio) como fix proactivo.
    Un 6º hallazgo minor quedó truncado en el pager del CLI y el cache incremental de CodeRabbit
    no lo re-listó; a re-verificar en un clon fresco la próxima sesión si se quiere cerrar del
    todo. 115/115 tests, tsc limpio. Rama `fase4-cadencias` lista para revisión de Sebastián
    (mismo patrón que fases anteriores: la revisa localmente antes de mergear).
