# Continuar la implementación · punto de entrada para la próxima sesión

Empieza AQUÍ. Este doc dice en qué estado quedó todo y qué archivos leer, en orden, para
retomar sin perder contexto. Última sesión: 2026-07-04.

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
- **Fase 2 (Auth, B3) COMPLETA en la rama `fase2-auth`, SIN MERGEAR** (pendiente de que
  Sebastián la revise localmente, mismo patrón que Fase 1). Better Auth email+password,
  tablas generadas por su CLI en la misma isps.db, gate de sesión en toda página/action,
  owner sale de la sesión (ya no hardcodeado ni del form), flag admin. Refinamiento sobre B3
  (documentado como B1.c en plan-claude-v2.md): `empresa.owner` guarda nombres, no emails, y
  la mayoría de empresas (89%, verificado) no tiene owner individual porque son leads en
  frío; la atribución de una campaña masiva (Fase 4) será `campana.owner`, un concepto
  aparte. Solo Sebastián tiene cuenta real (admin=1); Felipe se agrega con
  `scripts/seed_auth_users.ts` cuando dé su email y password. 10/10 tests, tsc limpio,
  CodeRabbit corrido y con hallazgos resueltos o descartados con razón.

## Próxima acción

**Arrancar Fase 3 (F1: conectores + ingest Granola + outbox Notion) por
`planning/tasks-v2.md`, empezando por V3.1.** Orden: V3.1 (migración conector+outbox) ->
V3.2 (cifrado AES-256-GCM) -> V3.3 (puerto TranscriptAdapter + GranolaAdapter) -> V3.4
(matcher + cola de revisión) -> V3.5 (worker B7) -> V3.6 (ingest idempotente) -> V3.7
(outbox a Notion) -> V3.8 (pantalla de conectores) -> V3.9 (cierre). Antes de tocar código:
mergear (o al menos revisar) la rama `fase2-auth` a main, porque Fase 3 depende de que
exista sesión (el owner real ya no es hardcodeado). Detalle completo de cómo se ejecutó la
Fase 2 (decisiones, fixes de review, verificación en vivo con el navegador) en la bitácora
de `planeacion-ejecucion.md`.

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
