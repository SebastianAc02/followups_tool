# Tareas v2 · lista de delegación a agentes

Estado (2026-07-04): Fase 1 (V1.1-V1.6) EJECUTADA y MERGEADA a main. Fase 2 (V2.1-V2.4)
EJECUTADA en la rama `fase2-auth`, sin mergear (pendiente de revisión de Sebastián). Fase 3
es la siguiente, empezar por V3.1. Se ejecuta una tarea por delegación, en orden. El
tasks.md viejo es del walking skeleton (T1 a T6 ya construidos); esta lista implementa el
alcance v2.

## Cómo usa esto un agente

Antes de tocar código, leer en este orden: `CLAUDE.md` (constitución), la sección de la fase
en `planning/plan-claude-v2.md` (el CÓMO y las decisiones B1 a B7), la feature correspondiente
en `planning/funcionalidades-v2.md` (el QUÉ y el Anexo de tablas). Para la Fase 5, además
`planning/experimento-apollo.md` (contrato del adaptador, no negociable).

Reglas que ninguna tarea rompe:
- El core no importa Granola, Notion, Claude, Apollo ni el driver de DB. Todo por puertos.
- Acceso a datos solo por el Repository. Nada de SQL regado.
- `canal` y `transcript_proveedor` son datos, no código.
- Las tablas maestras (empresa, contacto, toque) no se recrean. ALTER no destructivo con
  script dry-run + apply (patrón de `scripts/`). Tablas nuevas sí se crean por migración.
- Una feature no está lista sin sus pruebas. Cada fase cierra con demo + pruebas + /code-review.
- Textos para humanos en voz-onepay: sin emojis, sin em dashes, español directo.
- Routing de skills por tarea (regla del orquestador): backend siempre `api-patterns` +
  `database`; `design-patterns` al crear cada adaptador o puerto nuevo; `qa-test-planner`
  antes de escribir pruebas; `testing` genérico. UI menor arranca con `taste-skill`;
  superficie nueva grande (calendario Fase 4, panel Fase 7) suma `impeccable` +
  `frontend-design`.

Corrección (detectada en V1.3, 2026-07-03): el proyecto NO usa Tailwind CSS (confirmado en
package.json). Es CSS a mano en `app/globals.css` con variables custom (`--ink`, `--surface`,
`--line-strong`, etc.) y clases explícitas. Toda mención de `tailwindcss-development` o
`tailwind-css-patterns` más abajo en este archivo (V1.3, V3.8, V4.7) es un error de la
primera pasada del plan: en UI, sigue el patrón de globals.css, no instales Tailwind.

Dato verificado contra isps.db (2026-07-03): `contacto` YA tiene `es_key_decision_maker`,
`cargo_categoria`, `es_gerente`, `es_dueno`, `notas`. `toque` NO tiene `razon_perdida` ni
`objecion` (el ALTER de V1.1 es real). `toque.id_contacto` ya existe.

---

## Fase 1 · F0 cerrar el core (deuda primero) — ✅ COMPLETA, MERGEADA A MAIN (2026-07-04)

- [x] **V1.1 · Migración: ALTER a toque + reflejar schema.** Hecho: `scripts/migrate_f0_*.py`
  idempotentes por PRAGMA (no por captura de excepción); `toque.razonPerdida`/`objecion` y
  `contacto.esKeyDecisionMaker`/`cargoCategoria`/`notas`/`fuente` reflejados en schema.ts.

- [x] **V1.2 · Repository: registrar toque completo (B1.a).** Hecho: enum cerrado de 4
  salidas + Zod DENTRO de `registrarToque` (no solo en la UI, para que cualquier caller
  futuro obtenga la misma garantía); upsert de KDM en `contacto` (match por empresa+teléfono
  exacto si viene teléfono, si no inserta directo) en la misma transacción. 5 tests TDD.

- [x] **V1.3 · UI: cerrar el toque con canal, salidas, razón, objeción y KDM.** Hecho (sin
  Tailwind, ver corrección arriba): selector de canal del toque, las 4 salidas con labels
  compartidos (`RESULTADO_LABELS` en validation.ts), razón condicional a "no sigue" con
  `required`, objeción y KDM siempre visibles. Verificado en vivo contra isps.db real.

- [x] **V1.4 · Tap de WhatsApp / correo (F0.2).** Hecho: tap de un click desde la cola del
  día (fila reestructurada con Link + form hermanos, nunca anidados). Decisión confirmada
  con Sebastián: `resultado` de un tap siempre `no_contesto` (no se agregó 5to valor al enum).

- [x] **V1.5 · Contadores del día (F0.3 mínimo).** Hecho: `contadoresHoy` por canal y por
  resultado, agregado en memoria (volumen bajo). Documentado y testeado el caso de datos
  legado fuera del enum (total los incluye, los buckets no).

- [x] **V1.6 · Cierre de fase 1.** Hecho: CodeRabbit CLI instalado y corrido (0 hallazgos
  tras corregir ruta de DB hardcodeada en scripts y un bug de zona horaria en el cálculo de
  "mañana", nuevo `app/lib/date-utils.ts`). 8/8 tests. Mergeada a main fast-forward.

## Fase 2 · Auth (B3) — ✅ COMPLETA EN RAMA `fase2-auth` (2026-07-04), sin mergear

- [x] **V2.1 · Better Auth: instalación y tablas.** Hecho: `npm install better-auth`;
  `app/lib/auth.ts` (email+password, `disableSignUp` salvo `ALLOW_SIGNUP=1`,
  additionalFields `owner`/`admin` con `input:false`); schema generado por la CLI en
  `app/db/auth-schema.ts`, mergeado en `app/db/index.ts`. DDL de las 4 tablas generado con
  `drizzle-kit generate` (no transcrito a mano) y aplicado con
  `scripts/migrate_auth_dryrun.py` / `_apply.py`, idempotente, verificado en isps.db real.

- [x] **V2.2 · Gate de sesión + owner = email.** Hecho, con un ajuste sobre B3 (documentado
  como B1.c en plan-claude-v2.md): owner=email no aplicaba porque `empresa.owner` guarda
  nombres, no emails, y la tabla maestra no se migra; se agregó un campo `owner` propio en
  `user` con ese mapeo (`app/lib/session-user.ts`, TDD). `requireSession()` en
  `app/lib/session.ts` gatea página y actions; owner sale de la sesión, ya no del form.

- [x] **V2.3 · Usuarios día 1 + flag admin.** Hecho para Sebastián (admin=1) vía
  `scripts/seed_auth_users.ts`, verificado con login real en el navegador. Felipe pendiente
  de que dé su email y password (mismo script, `SEED_EMAIL_FELIPE`/`SEED_PASSWORD_FELIPE`);
  no bloquea el cierre de la fase.

- [x] **V2.4 · Cierre de fase 2.** 10/10 tests, tsc limpio. CodeRabbit: 2 hallazgos reales
  corregidos (catch de red en LoginForm, cierre garantizado de DB en el seed) y 1 descartado
  (ruta de DB hardcodeada, mismo patrón aceptado en Fase 1). Demo verificada en vivo: sin
  sesión redirige a `/login`; login/logout reales; signup por API deshabilitado. Bitácora en
  planeacion-ejecucion.md. Rama sin mergear, pendiente de revisión de Sebastián.

## Fase 3 · F1 conectores + ingest Granola + outbox Notion

- [x] **CERRADA (2026-07-06), MERGEADA A MAIN.** Esta lista quedó desactualizada tras el
  rediseño del matcher (2026-07-04): el matching de fondo por `empresa_alias` con cola de
  revisión (V3.4 aquí abajo) se descartó, quedó on-demand disparado al confirmar un toque
  contestado, por nombre de empresa/alias + teléfono como término extra (el teléfono no
  sobrevivió como clave principal contra datos reales de Granola). El detalle real ejecutado,
  tarea por tarea (V3.1 a V3.10, con V3.1b agregada a medio camino), vive en
  `plan-fase3.md`, ya con cada paso marcado. Los checkboxes de abajo (V3.1-V3.9) NO
  reflejan lo que realmente se construyó, se dejan sin tocar como registro histórico de la
  intención original.

- [ ] **V3.1 · Migración: tablas conector y outbox.**
  Script dry-run + apply: `conector` (proveedor, ciphertext de credencial, estado,
  ultima_corrida, ultimo_resultado) y `outbox` (entidad, id_registro, payload, estado,
  intentos, proximo_intento). Reflejar en schema.ts.
  Lista cuando: apply idempotente y schema refleja.

- [ ] **V3.2 · Cifrado de credenciales.**
  Util con Node crypto (AES-256-GCM, llave en variable de entorno, sin dependencia nueva).
  Guardar y leer credencial de `conector` solo vía Repository; nunca la key en claro en DB,
  logs ni repo.
  Lista cuando: prueba cifra y descifra; sin la llave del entorno el ciphertext no se lee.

- [ ] **V3.3 · Puerto TranscriptAdapter + GranolaAdapter.**
  design-patterns primero: el puerto vive en el core, el adaptador afuera. GranolaAdapter
  lista sesiones nuevas y trae el RESUMEN (no el transcript literal). La credencial la lee
  el server desde `conector`.
  Lista cuando: prueba con doble (mock) del puerto pasa; el adaptador real lista sesiones
  contra Granola con la credencial guardada.

- [ ] **V3.4 · Matcher + cola de revisión (F1.4).**
  Matcher contra `empresa_alias` (los matches confirmados escriben alias nuevos). Sesión que
  no enlaza NO inventa match: queda en cola de revisión (estado en tabla, no toque). UI
  mínima para resolver a mano (elegir empresa o descartar); al resolver se crea el toque y
  el alias.
  Lista cuando: prueba con nombre inventado cae en cola; al resolverla nace el toque y el
  alias queda para la próxima.

- [ ] **V3.5 · Worker B7 con heartbeat.**
  `npm run worker`: Node puro, loop con setTimeout, sin dependencia nueva. 4 tareas
  secuenciales (hoy solo ingest y outbox; cadencias y tracking se enchufan en fases 4 y 5).
  Catch-up-first: al arrancar procesa TODO lo atrasado. Heartbeat (última corrida +
  resultado) en `conector`. Plist de launchd documentado en el repo.
  Lista cuando: mato el worker, creo atraso, lo arranco y procesa lo atrasado antes de
  esperar; el heartbeat queda escrito.

- [ ] **V3.6 · Ingest idempotente (B4).**
  Por sesión nueva: matcher, resumen, toque + puntero (transcript_proveedor, transcript_id,
  transcript_url) + resumen cacheado. Clave de idempotencia: proveedor + transcript_id; si
  ya existe, actualiza el cacheado, nunca segundo toque. Si el proveedor trae transcript sin
  resumen o al revés, guarda lo que haya sin romperse.
  Lista cuando: la prueba de doble ingesta deja UN toque; la de resumen faltante deja el
  toque marcado sin resumen.

- [ ] **V3.7 · Outbox a Notion (F1.5).**
  NotionAdapter detrás de puerto. La fila de outbox se escribe en la MISMA transacción que el
  cambio. El worker drena: idempotente, backoff en reintentos, log en sync_cambios. Nada
  sube sin revisión humana previa (aprobación marca la fila como lista para drenar).
  Lista cuando: cambio aprobado llega a Notion una sola vez aunque el worker corra dos veces;
  fallo de red deja la fila pendiente con reintento programado.

- [ ] **V3.8 · Pantalla de conectores.**
  Estado de cada conector: vivo o caído, última corrida, aviso de token vencido. Alta de
  credencial (se pega una vez, va cifrada). Skills: taste-skill + tailwindcss-development.
  Lista cuando: token inválido se ve en la pantalla sin mirar logs.

- [ ] **V3.9 · Cierre de fase 3.** Las pruebas que importan: idempotencia y matcher. Demo
  (reunión real aparece sola; inventada cae en cola) + /code-review + bitácora.

## Fase 4 · F3 sin envío (modelo de cadencias, motor EN SECO) — ✅ COMPLETA EN RAMA `fase4-cadencias` (2026-07-06)

Ejecutada straight-through V4.1-V4.8, un commit por tarea. 115/115 tests, tsc limpio,
`/code-review` corrido (6 hallazgos: 3 corregidos, 2 descartados por precedente, 1 minor
truncado). Detalle en `planeacion-ejecucion.md`. A diferencia de Fase 3, el desglose de abajo
SÍ refleja lo construido (se siguió tal cual). Rama sin mergear, para revisión de Sebastián.

- [x] **V4.1 · Migración: grupos 1 y 2 del Anexo.**
  Script dry-run + apply: `cadencia`, `paso_cadencia`, `version_paso`, `segmento`, `campana`,
  `inscripcion` (con índice único parcial: una activa por empresa), `destinatario`. Columnas
  exactas del Anexo de funcionalidades-v2.md. Reflejar en schema.ts.
  Lista cuando: apply idempotente; el índice único parcial rechaza segunda inscripción activa
  de la misma empresa en una prueba SQL.

- [x] **V4.2 · Repository de cadencias + import CSV/MD (F3.2).**
  Parser de cadencia desde CSV o Markdown (toques con orden, dia_offset, canal, asunto,
  cuerpo) que crea cadencia + pasos + version default. Todo por Repository.
  Lista cuando: importo la cadencia real de Sebastián y queda como template consultable.

- [x] **V4.3 · Segmentos guardados (F3.1 v1).**
  Filtros sobre la base propia (tier, estado, on-hold, categoria) con UI de filtros; el
  filtro compilado se guarda como JSON en `segmento.definicion`. El lenguaje natural llega
  en Fase 6, no aquí.
  Lista cuando: guardo "on-hold" como segmento y la lista de empresas que devuelve es la
  esperada contra un conteo SQL a mano.

- [x] **V4.4 · Versiones A/B del paso (F3.4).**
  Versiones colgadas del mismo paso (version_paso: es_default, activa, peso). Iterar copy =
  nueva versión, no editar la enviada.
  Lista cuando: un paso con 2 versiones reparte según peso en una prueba del motor en seco.

- [x] **V4.5 · Inscripción + destinatario default (B1.b).**
  Inscribir un segmento en una campaña: por empresa, destinatarios default en orden KDM,
  luego principal, luego primero con email. Sin ningún email: la inscripción nace
  `bloqueada` y cae en la cola de revisión (mismo patrón F1.4). Una activa por empresa: si
  entra a otra campaña, sale de la anterior con motivo_fin.
  Lista cuando: pruebas cubren los 4 defaults (KDM, principal, primero, bloqueada) y el
  cambio de campaña deja historial.

- [x] **V4.6 · Motor de fechas EN SECO (la prueba más densa del proyecto).**
  Cálculo de "hoy toca X" por dia_offset relativo, días bloqueados (ej. domingo), regla de
  corrimiento (siguiente o anterior, configurable), re-anclaje al día real cuando un paso se
  atrasa (B6: los atrasados NO se disparan juntos). Sin enviar nada: produce filas
  calculadas, no correos. qa-test-planner antes de escribir estas pruebas.
  Lista cuando: suite cubre offsets, bloqueados, corrimiento en ambas direcciones, re-anclaje
  tras atraso, y worker caído un día no dispara pasos en ráfaga.

- [x] **V4.7 · Constructor de cadencia con vista calendario (F3.6).**
  Superficie nueva grande: taste-skill, luego impeccable (dirección), frontend-design,
  tailwindcss-development + tailwind-css-patterns, build, impeccable (auditoría). Desglose
  por día, días bloqueados configurables, pregunta de corrimiento, preview "así se ve la
  cadencia en acción". Nota de diseño del alcance: NO el típico grid de mes.
  Lista cuando: subo cadencia, la veo día por día, bloqueo domingo y el corrimiento se ve.

- [x] **V4.8 · Cierre de fase 4.** Demo completa (cadencia real, inscripción on-hold, toques
  de mañana en seco, una activa por empresa) + /code-review + bitácora.

## Fase 5 · F3.5 + F4 envío por Apollo y tracking (leer experimento-apollo.md ANTES)

**Backend (V5.1, V5.2, V5.4, V5.5, V5.6) + V5.7 completos, 2026-07-06.** A pedido
explícito de Sebastián: solo backend al inicio (el front de cadencias se está
rehaciendo en paralelo, ver bitácora); V5.7 sí tocó UI porque es la única pieza que
unifica cadencias con la cola existente, y se hizo con cuidado de no chocar con la
sesión paralela (nueva sección en /cola, sin tocar globals.css). V5.3 (escritura real
de Apollo) en pausa a propósito hasta
que confirme tocar la cuenta real. V5.7 es la acción inmediata siguiente.

- [x] **V5.1 · Migración: grupo 3 del Anexo.**
  `paso_inscripcion` (índice único id_destinatario + id_paso) y `evento_tracking`
  (append-only, proveedor_evento_id para idempotencia, índices por id_paso_inscripcion y
  fecha_evento). Reflejar en schema.ts.
  Lista cuando: apply idempotente; el índice único rechaza duplicado en prueba.

- [x] **V5.2 · Puerto EnvioAdapter + implementación Apollo.**
  design-patterns primero. Contrato de experimento-apollo.md al pie: header `X-Api-Key` (no
  Bearer), `add_contact_ids` exige emailer_campaign_id en el CUERPO + mailbox id,
  search-first por email antes de crear contacto (no gasta créditos ni duplica), no existe
  DELETE por API (solo archive/remove_or_stop). Key por variable de entorno.
  Lista cuando: pruebas con doble del puerto pasan; el adaptador real autentica y lee (las
  escrituras se prueban en V5.3, no aquí).

- [ ] **V5.3 · Gate G1: escritura de Apollo e2e.** PENDIENTE, en pausa a propósito
  (necesita luz verde de Sebastián para tocar la cuenta real de Apollo).
  Con contacto de descarte: create-contact, add_contact_ids, verificación de que sin aprobar
  no envía, y limpieza (remove_or_stop + archive). Confirmar subida de copy por API.
  Pendiente de negocio buzón/seat NO bloquea esta prueba (se usa el buzón que haya).
  Lista cuando: el flujo e2e corrió contra la cuenta real y quedó anotado en
  experimento-apollo.md; G1 marcado en planeacion-ejecucion.md.

- [x] **V5.4 · Push reanudable (B6).**
  Máquina de estados por destinatario en paso_inscripcion (pendiente, enviando, enviada,
  fallo). Sin lote transaccional: la corrida siguiente retoma pendiente/fallo con backoff.
  Idempotencia por índice único + search-first. Tarea del worker.
  Lista cuando: prueba de fallo a mitad de lote de N reanuda solo los que faltan, sin
  duplicar ni contacto ni envío.

- [x] **V5.5 · Poll de tracking + reply detection.**
  Tarea del worker: emailer_messages/search a evento_tracking (idempotente por
  proveedor_evento_id). Reply de CUALQUIER destinatario pausa la inscripción de inmediato
  (ningún paso futuro sale). Bounce pasa el destinatario a `salio`; si todos salieron, la
  inscripción se pausa con motivo_fin visible.
  Lista cuando: pruebas de reply, bounce y doble poll (mismo evento no se duplica) pasan.

- [x] **V5.6 · Manual email Tier 1 + freno manual.**
  El paso manual es un FLAG del paso, no una rama de código. Sin revisar: la cadencia ESPERA,
  el paso aparece atrasado, y los offsets siguientes se re-anclan a la fecha real de envío.
  Freno manual de la inscripción tras una llamada.
  Lista cuando: prueba de manual sin revisar 3 días no dispara nada; al aprobar, el
  siguiente paso se calcula desde la fecha real.

- [x] **V5.7 · Cola del día unificada.**
  Los toques automatizados de hoy (paso_inscripcion) y los manuales conviven en la misma
  cola, con los atrasados visibles.
  Lista cuando: la demo de la fase se ve en una sola pantalla.

- [ ] **V5.8 · Cierre de fase 5.** Pruebas que importan: reanudación a mitad de lote e
  idempotencia de eventos. Demo (cadencia real en segmento chico; una respuesta pausa sola)
  + /code-review + bitácora.

## Fase 6 · F5 + F6 IA sobre el plan

- [ ] **V6.1 · Gate G2: spike de Agent SDK headless.**
  Probar que el ClaudeAdapter corre sobre el plan sin sesión interactiva. Si no rinde, plan
  B: API con presupuesto chico; el puerto no cambia. Anotar resultado en
  planeacion-ejecucion.md.
  Lista cuando: una extracción de prueba corre headless de punta a punta (o el plan B queda
  decidido y anotado).

- [ ] **V6.2 · Puerto + ClaudeAdapter.**
  design-patterns primero. El core pide "extrae borradores de este resumen" por el puerto;
  el adaptador habla con el SDK.
  Lista cuando: prueba con doble del puerto pasa y el adaptador real responde.

- [ ] **V6.3 · Extracción de borradores (F5).**
  Del resumen cacheado: Notas Discovery (solo facts), el "qué pasó" narrado en voz-onepay,
  Brief, propuesta de próximo paso. Todo queda como BORRADOR, nunca directo a Notion.
  Lista cuando: llega una reunión y el borrador completo queda esperando revisión.

- [ ] **V6.4 · Flujo borrador, aprobar, outbox.**
  UI de revisión (corregir a mano, aprobar, rechazar). Aprobar escribe al outbox de V3.7;
  la IA jamás llega a Notion sin ese paso.
  Lista cuando: apruebo un borrador y sale a Notion por el outbox; uno rechazado no sale.

- [ ] **V6.5 · Evals de extracción.**
  Correr y completar `planning/evals.md` sobre transcripts reales ANTES de dar la extracción
  por lista. Es la prueba de esta fase.
  Lista cuando: los evals corren y el resultado queda documentado en evals.md.

- [ ] **V6.6 · Cierre de fase 6.** Demo + /code-review + bitácora.

## Fase 7 · F2 panel admin (solo lee)

- [ ] **V7.1 · Queries agregadas en el Repository.**
  KPI norte: follow-ups perdidos por semana (toques con fecha vencida sin registrar). Toques
  por persona, tipo y canal; connection rate; reuniones agendadas; gerentes conseguidos.
  Solo lectura.
  Lista cuando: cada query tiene prueba contra datos sembrados con resultado conocido.

- [ ] **V7.2 · UI del panel (flag admin).**
  Superficie nueva grande: taste-skill, impeccable, frontend-design. Visible solo con flag
  admin de V2.3. Absorbe lo que F0.3 dejó mínimo en V1.5.
  Lista cuando: como admin veo el pulso de la semana; sin flag, no existe la ruta.

- [ ] **V7.3 · Cierre de fase 7 y del alcance v2.** Demo + /code-review + bitácora.

---

## Tareas sueltas (no bloquean, sin orden)

- [ ] **S1 · Limpieza en Apollo.** `remove_or_stop_contact_ids` + `archive` de la secuencia
  ZZZ-TEST-BORRAR-2026-07-03. Los 2 contactos son REALES (Mailbox Sync desde mayo): no se
  tocan. Borrado total de borradores archivados: manual en la UI de Apollo.
- [ ] **S2 · Decisión buzón/seat con Camilo.** Para enviar como Sebastián y no como Camilo.
  Es de negocio, no de código; solo bloquea la identidad de envío en producción, no la
  construcción de la Fase 5.
- [ ] **S3 · Drift silencioso entre test-helpers.ts y schema.ts.** `app/db/test-helpers.ts`
  duplica a mano el DDL de las tablas reales para las pruebas de Repository, y puede
  desincronizarse en silencio de `app/db/schema.ts` (Drizzle). Ya pasó en V1.2: la columna
  `usuarios_reales` en test-helpers.ts vs `usuarios_efectivos` en schema.ts, corregido en el
  fix de code review de esa tarea. El comentario de buena fe en test-helpers.ts no evitó el
  drift; el mecanismo de duplicación sigue existiendo para toda tabla nueva que se agregue
  ahí. No se implementa la solución de fondo ahora (generar el DDL desde schema.ts, o un
  test de smoke que compare `PRAGMA table_info` de isps.db real contra test-helpers.ts):
  queda anotada para que alguien la tome después.
