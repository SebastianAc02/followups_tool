# Plan de Claude · implementación de funcionalidades-v2

Plan independiente de la IA, generado con el orquestador (stack B: Next.js + Drizzle +
SQLite). Cubre los mismos slots que hoja-plan-v2.md para poder compararlos lado a lado.
Cada decisión de peso lleva: decisión + por qué + alternativa rechazada + costo aceptado.

---

## Marco

1. **Problema y para quién.** Los follow-ups por correo de OnePay dependen de armar todo a
   mano en Apollo y de leer tracking plano de MailSuite; se pierden toques y no hay dato
   estructurado. Para Sebastián y Felipe.
2. **Objetivo primario.** Cero toques perdidos: cada toque del día (correo automatizado o
   manual) queda visible, ejecutado y registrado como dato estructurado en isps.db.
3. **Fuera de alcance.** WhatsApp como canal (F7), LinkedIn, envío automático de Tier 1 sin
   revisión, sync Notion de dos vías, scoring, multipersona en UI más allá del destinatario.
4. **Criterios de aceptación.**
   - F0: registro un toque de llamada y quedan canal real, una de las 4 salidas, razón de
     pérdida si aplica, KDM si lo pasaron. Un tap registra toque de WhatsApp o correo.
   - F1: conecto Granola una vez; una reunión nueva aparece como toque con resumen cacheado
     sin que yo haga nada; una que no matchea cae en cola de revisión.
   - F3: subo mi cadencia por CSV/MD, la veo por días en el constructor, inscribo un
     segmento y cada empresa queda con UNA inscripción activa.
   - F4: veo delivered/opened/reply por destinatario en la herramienta, sin CSV externo;
     una respuesta pausa la inscripción sola.
   - F5: al revisar una llamada con transcript, el borrador ya está escrito y yo solo corrijo.
   - F2: veo toques del equipo, follow-ups perdidos por semana, connection rate.
5. **Invariantes.**
   - Nunca dos toques por la misma sesión (transcript_proveedor + transcript_id).
   - Nunca sale un correo Tier 1 sin revisión humana.
   - Nunca más de una inscripción activa por empresa.
   - Nunca una credencial en claro en la DB ni en el repo.
   - Notion solo se escribe vía outbox; la IA solo llega a Notion tras aprobación.
   - El core nunca importa Granola, Notion, Claude, Apollo ni el driver de DB.
6. **Modos de fallo que preveo.** Token de Granola vence en silencio; el reseed de Notion
   revienta contra los CHECK de estado (lista cerrada); el laptop está apagado a la hora
   del envío; Apollo duplica contactos o gasta créditos por usar el endpoint equivocado;
   el matcher enlaza a la empresa equivocada (peor que no enlazar); un manual email de
   Tier 1 se queda semanas sin revisar y la cadencia entera se atasca.
7. **Supuesto más riesgoso.** Que la master key del plan Apollo Professional expone
   add-to-sequence y el tracking legible (emailer_messages/search). Si es falso, F3.5 y F4
   cambian de proveedor o de diseño. Por eso P0 va de primero en el orden de construcción.

---

## Decisiones que la hoja dejaba vivas

### B1.a · Dónde viven razón de pérdida, objeción y KDM (F0.1)

**Decisión.** Dos columnas nuevas en `toque`: `razon_perdida` TEXT y `objecion` TEXT.
`resultado` guarda una de las 4 salidas como string cerrado validado en código (Zod en la
server action + Repository), sin CHECK en DB. El KDM no se guarda en el toque: se crea o
actualiza una fila en `contacto` con es_key_decision_maker=1 (el modelo multipersona ya
existe) y el toque queda enlazado por id_contacto.
**Por qué.** El dato del KDM es un contacto (tiene teléfono, luego será destinatario de
campañas); duplicarlo como texto en el toque lo vuelve inservible para F3. Razón y objeción
sí son del evento, no de la persona.
**Alternativa rechazada.** Tabla `toque_detalle` aparte (un join más sin variación real que
lo justifique) y CHECK en DB (en SQLite cambiar un CHECK exige recrear la tabla maestra;
demasiado caro para una lista que puede crecer).
**Costo aceptado.** SQL a mano puede meter un resultado inválido; se acepta porque todo
acceso pasa por el Repository. Y agregar columnas a `toque` ES tocar una maestra: se hace
con ALTER TABLE ADD COLUMN (no destructivo) y script con dry-run, como los seeds.

### B1.b · Default de destinatario al inscribir

**Decisión.** Al inscribir una empresa, destinatarios por defecto = contactos con email,
en orden: es_key_decision_maker=1, si no hay, es_principal=1, si no hay, el primero con
email. Si NINGÚN contacto tiene email, la inscripción se crea en estado `bloqueada` y
aparece en la cola de revisión (la misma de F1.4, es el mismo patrón: humano resuelve).
**Por qué.** El invariante es cero toques perdidos: dejar la empresa fuera en silencio es
un toque perdido invisible; bloqueada y visible es un pendiente accionable (conseguir email).
**Alternativa rechazada.** No dejarla entrar al segmento (se pierde la visibilidad) o
mandarle a todos los contactos por defecto (quema la base; multipersona es opt-in).
**Costo aceptado.** Un estado más en `inscripcion` y su rama en el motor.

### B1.c · Ownership en dos niveles: persona (empresa.owner) vs campaña (campana.owner)

**Decisión.** `empresa.owner` es la atribución de HOY, a nivel persona, y sigue existiendo
tal cual (Fase 2 la lee de la sesión, sin cambios). Pero 1737/1959 empresas (89%, verificado
contra isps.db 2026-07-04) NO tienen owner: sobre todo frío nunca tocado (1433 con
estado_notion vacío), y también un tramo ya en funnel (lead/on_hold/firma_pago). Esas
empresas NO entran a la cola personal de nadie en v1, ni antes ni después de Fase 2: eso ya
pasa hoy y es correcto (nadie las ha tocado todavía). Cuando F3 (Fase 4) inscriba un
segmento en una campaña masiva, la atribución de ESA masa de leads es la campaña, no una
persona: `campana.owner` (ya en el Anexo, línea "campana: ... owner ...") es el responsable
de ejecutar los toques de esa campaña completa, sin escribir nada en `empresa.owner`. Un
mismo humano puede ser owner de campañas distintas (Sebastián en tier1/2/3 frío, Felipe en
las suyas).
**Por qué.** Evita el error de modelar "toda empresa tiene un owner-persona" como
invariante permanente: rompería en cuanto exista una campaña masiva sobre miles de leads
frías. Mantiene el core simple ahora (Fase 2 no toca esto) y deja la costura donde ya
estaba prevista (Anexo de campana), sin inventar tabla nueva.
**Alternativa rechazada.** Backfill de `empresa.owner` al owner de la campaña al inscribir:
mezclaría atribución individual real con atribución masiva temporal, y se perdería en
cuanto la empresa saliera de la campaña o entrara a otra.
**Costo aceptado.** La cola personal (`colaDelDia`) y el panel de campaña (Fase 4/5) son dos
vistas distintas sobre el mismo pipeline; no se resuelve con un solo filtro `owner`. Se
construye en Fase 4, no ahora.

### B5 · Evolución y deuda (diferido y costuras)

| Diferido | Costura que queda HOY |
|---|---|
| WhatsApp (F7) | `canal` es dato en paso_cadencia y toque; entra sin migrar. paso_inscripcion ya tiene `proveedor`. |
| LinkedIn | Igual: canal nuevo + paso manual en cola del día. Cero código hoy. |
| Otro proveedor de envío (si Apollo falla) | Puerto `EnvioAdapter` en el core; Apollo es solo una implementación. |
| Otro proveedor de transcript (tl;dv) | Ya es dato (transcript_proveedor) + puerto TranscriptAdapter. |
| Volumen de eventos | evento_tracking append-only detrás del Repository; se mueve sin tocar core. |
| Envío 100% automático Tier 1 | El paso "manual email" es un flag del paso, no una rama de código: quitar el flag es la migración. |
| Turso (fase 2) | Misma sintaxis Drizzle; el único punto de dolor es better-sqlite3 -> libsql client, aislado en app/db/index.ts. |

**Costo aceptado.** Un puerto (EnvioAdapter) con una sola implementación hoy: abstracción
pagada por adelantado. Se justifica porque el supuesto más riesgoso del plan es justamente
el proveedor de envío.

### B6 · Modelo de fallos del ENVÍO

- **Push falla a mitad de un lote de 40.** No hay "lote" transaccional: cada destinatario
  avanza su propia máquina de estados en paso_inscripcion (pendiente -> enviando ->
  enviada | fallo). La corrida siguiente retoma solo los `pendiente`/`fallo` con backoff.
  Idempotencia: índice único (id_destinatario, id_paso) + search-first en Apollo por email
  antes de crear contacto. Nunca se duplica un envío ni un contacto.
- **Bounce.** evento_tracking tipo bounce -> el destinatario pasa a `salio`. Si todos los
  destinatarios de la inscripción salieron, la inscripción se pausa con motivo_fin visible.
- **Manual email de Tier 1 sin revisar 3 días.** La cadencia ESPERA (el invariante de
  revisión no se negocia) y el paso aparece como atrasado en la cola del día y el panel.
  Los offsets siguientes se re-anclan a la fecha real de envío del paso, no al calendario
  original (no se disparan 3 pasos juntos al aprobar).
- **Respuesta tardía (el toque siguiente ya salió).** Al detectar reply se pausa la
  inscripción de inmediato; el correo ya enviado no se puede des-enviar, queda registrado
  tal cual. Lo que se garantiza es que ningún paso FUTURO sale.
- **El contacto ya existía en Apollo.** Search-first por email; si existe, se enlaza el id
  existente y no se crea (ni gasta créditos ni duplica). Si está en otra secuencia de
  Apollo, se registra en el paso como advertencia y decide el humano.

**Alternativa rechazada.** Envío por lotes transaccionales (todo o nada): más simple de
razonar pero un fallo bloquea a 39 destinatarios sanos. **Costo.** Más estados por fila y
un motor que debe ser reentrante.

### B7 · Dónde corre el trabajo de fondo

**Decisión.** Un proceso worker aparte en el mismo repo (`npm run worker`, Node puro, sin
dependencia nueva: loop con setTimeout), que corre las 4 tareas (ingest Granola, avance de
cadencias, poll de tracking, outbox Notion) como pasadas secuenciales. Diseño catch-up-first:
cada arranque procesa TODO lo atrasado antes de esperar; launchd lo levanta al iniciar
sesión en macOS. Cada pasada escribe heartbeat (última corrida + resultado) en `conector`,
y la pantalla F1 lo muestra: eso cubre "no se cae en silencio".
**Por qué.** El laptop apagado es un hecho, no un fallo: ningún scheduler lo resuelve. La
robustez real es que reanudar procese los atrasados, no que el reloj nunca falle. Y separar
el worker del proceso Next respeta la frontera: la app web sirve UI, el worker ejecuta.
**Alternativa rechazada.** setInterval dentro de Next (muere con el dev server y mezcla
fronteras); cron/launchd por tarea (4 entradas de sistema opacas, sin heartbeat común);
mover el worker a un VPS hoy (resuelve el laptop apagado pero adelanta infra que la fase
Turso va a replantear de todos modos).
**Costo aceptado.** Un proceso más que operar, y si el laptop está apagado los envíos
esperan hasta el próximo arranque (aceptable a este volumen; la costura para VPS queda).

---

## Descartados (mismo test que la hoja)

Rendimiento y escala, patrones de diseño (los adaptadores nuevos caen en el molde ya
fijado), seguridad (cerrada en B3), concurrencia (cubierta por idempotencia B4 + índices
únicos B1 + worker single-process secuencial, que elimina carreras por diseño). El detalle
de toques atrasados quedó decidido dentro de B6: se re-anclan, no se disparan juntos.

---

## Fases de construcción (con routing del orquestador)

Regla transversal (orquestador): stack B siempre `api-patterns` + `database` (nunca los de
Laravel), `design-patterns` al crear cada adaptador nuevo, `qa-test-planner` antes de las
pruebas, `testing` genérico (no Pest), `/code-review` como gate de cierre de CADA fase.
`ddd-architecture` se salta: es de Vue/Nuxt y la constitución ya fija las fronteras.
Frontend siempre arranca con `taste-skill`; `impeccable` + `frontend-design` solo en
superficies nuevas grandes. Cada fase se parte en tareas de planning/tasks.md, una por
delegación, diff pequeño.

**Fase 0 · P0: verificar Apollo en vivo (solo lectura). De-riesga el supuesto #7.**
Sin código de producto. Auth de la master key, emailer_messages/search, listar secuencias
y buzones, usage stats. Key por variable de entorno, nunca en el chat ni el repo.
Demo: planning/apollo-verificado.md con las respuestas reales y la matriz "qué expone / qué
no". Riesgo y plan B: si no expone add-to-sequence o el tracking, F3.5/F4 cambian a otro
motor de envío detrás del mismo EnvioAdapter (Instantly/Smartlead/manual), y se decide ANTES
de construir Fase 5. create-contact y add-to-sequence quedan documentados-no-probados hasta
Fase 5 (regla de no dejar registro).

**Fase 1 · F0: cerrar el core (la deuda primero).**
B1.a completo: ALTER a `toque` (razon_perdida, objecion), 4 salidas validadas en código,
KDM a `contacto`, canal real del toque. F0.2: tap de WhatsApp/correo. F0.3 mínimo: contadores
del día en la misma pantalla (el tablero grande se difiere a F2). Reflejar en schema.ts las
columnas reales que se usen (es_key_decision_maker, cargo_categoria).
Migración: script con dry-run + apply (patrón de scripts/ existente).
Chain: database -> api-patterns -> build -> qa-test-planner -> testing -> /code-review.
UI menor: taste-skill + tailwindcss-development.
Demo: registro una llamada con salida "contestó-no", razón Precio, y el KDM queda en
contacto; un tap registra un correo manual.

**Fase 2 · B3: auth (antes que conectores, porque credenciales y owner dependen de identidad).**
Better Auth email+password, tablas en la misma SQLite vía CLI, owner=email, flag admin.
Chain: api-patterns -> database -> testing -> /code-review.
Demo: login de Sebastián y Felipe; sin sesión no se ve nada.

**Fase 3 · F1: conectores + ingest de Granola + outbox de Notion.**
Tabla `conector` (ciphertext AES-256-GCM), tabla `outbox`, worker B7 con heartbeat,
GranolaAdapter (puerto TranscriptAdapter), matcher -> cola de revisión F1.4, idempotencia
B4, pantalla de conectores con estado/última corrida/aviso de token vencido. Sync a Notion
vía outbox con revisión.
Chain: design-patterns (forma de los dos puertos) -> database -> api-patterns -> build ->
qa-test-planner -> testing (idempotencia y matcher son las pruebas que importan) ->
/code-review. UI: taste-skill -> tailwindcss-development.
Demo: reunión real de Granola aparece como toque con resumen; una inventada cae en la cola.

**Fase 4 · F3 sin envío: modelo de cadencias, segmentos y constructor.**
Migración grupo 1 y 2 del Anexo (cadencia, paso_cadencia, version_paso, segmento, campana,
inscripcion con índice único parcial, destinatario). Import de cadencia por CSV/MD (F3.2),
segmentos como filtros guardados sobre la base (F3.1 v1 con UI de filtros; el lenguaje
natural llega con F6), versiones A/B (F3.4), constructor con vista por días, días bloqueados
y regla de corrimiento (F3.6). Inscripción en seco: el motor calcula "hoy toca X" sin enviar.
Chain backend: database -> api-patterns -> build -> qa-test-planner -> testing (motor de
fechas y corrimiento: la prueba más densa del proyecto) -> /code-review.
Frontend (superficie nueva grande, el calendario que no puede verse genérico):
taste-skill -> impeccable (dirección) -> frontend-design -> tailwindcss-development +
tailwind-css-patterns -> build -> impeccable (auditoría). Sin emil-design-eng salvo que el
calendario pida motion.
Demo: subo mi cadencia real, la veo día por día, inscribo "on-hold" y veo los toques de
mañana en seco, con una sola inscripción activa por empresa.

**Fase 5 · F3.5 + F4: envío por Apollo y tracking.**
Migración grupo 3 (paso_inscripcion, evento_tracking). Puerto EnvioAdapter con
implementación Apollo (search-first, add-to-sequence, manual email Tier 1). Aquí se prueban
a propósito create-contact/add-to-sequence con un contacto de descarte que se borra. Poll de
tracking al worker, eventos a evento_tracking, reply detection que pausa, B6 completo,
freno manual tras llamada. Cola del día unificada (automatizado + manual).
Chain: design-patterns (EnvioAdapter) -> api-patterns -> database -> build ->
qa-test-planner -> testing (reanudación a mitad de lote e idempotencia de eventos) ->
/code-review.
Demo: cadencia real corriendo para un segmento chico; veo aperturas y una respuesta pausa
la inscripción sola.

**Fase 6 · F5 + F6: IA sobre el plan.**
ClaudeAdapter vía Agent SDK (headless), extracción de borradores (Notas Discovery, qué pasó
en voz-onepay, Brief, próximo paso propuesto), flujo borrador -> aprobar -> outbox. Evals en
planning/evals.md ANTES de dar por lista la extracción (es la prueba de esta fase).
Riesgo y plan B: si el SDK no rinde headless sobre el plan, el adaptador cambia a API con
presupuesto chico; el puerto no cambia.
Chain: design-patterns -> api-patterns -> build -> evals -> /code-review.
Demo: llega reunión de Granola y el borrador completo espera mi revisión; apruebo y sale a
Notion por el outbox.

**Fase 7 · F2: panel admin.**
KPI norte (follow-ups perdidos por semana = toques con fecha vencida sin registrar), toques
por persona/tipo/canal, connection rate, reuniones, gerentes. Flag admin. Absorbe F0.3.
Va de última porque solo LEE lo que las fases anteriores escriben.
Chain frontend completo (superficie nueva) + api-patterns para las queries agregadas ->
testing -> /code-review.
Demo: entro como admin y veo el pulso del equipo de la semana sin tocar nada.

**Por qué este orden.** Fase 0 mata el supuesto más riesgoso antes de construir encima;
Fase 1 paga la deuda de la que todo cuelga (las 4 salidas alimentan métricas y campañas);
auth antes de conectores porque cifrado y owner dependen de identidad; el modelo de
cadencias se construye y PRUEBA en seco (Fase 4) antes de conectarle el envío (Fase 5),
para que el motor de fechas no se depure con correos reales; la IA (6) consume lo que el
ingest (3) produce; el panel (7) solo lee. Cada fase cierra con demo, pruebas y
/code-review: sin eso no se abre la siguiente.
