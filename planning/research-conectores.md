# Research — APIs de conectores y Apollo (2026-07-03)

Hechos verificados con fuentes. Sin recomendaciones: esto alimenta los dos planes
(el de Sebastián y el de Claude) por igual.

## 0. Resumen — como quedo la conversacion hasta aca

Tres hilos corriendo en paralelo:

1. **El core actual de la herramienta** (que funciona y que falta) — seccion 9.
2. **El pivote de alcance** (auth + conectores + cadencias, en vez de solo
   registrar toques de Granola) — la hoja de decision sigue abierta en
   `planning/hoja-plan-v2.md`, la llena Sebastian antes de comparar planes.
3. **El research de conectores** para elegir el motor de la cadencia — hecho,
   con huecos donde se corto el credito (secciones 1-7 y 8 abajo).

El PDF que definio la vara (`Playbook - Piramide y Cadencia`) esta transcrito
completo en la seccion 8. Lo que sigue en el aire — Apollo vs Lemlist vs
MailSuite+custom vs headless — esta resumido en la seccion 10.

## 1. Granola (granola.ai)

- API REST oficial SÍ existe (reciente, ~dic 2025). Docs: https://docs.granola.ai/introduction
- Auth: Bearer API key con prefijo `grn_`. La genera el propio usuario desde la app:
  Settings -> Connectors -> API keys, eligiendo scopes.
- Restricción de plan: "Any workspace member on a Business plan can create API keys".
  La doc NO confirma si un plan Free/individual puede crear keys (incierto).
- Lectura: `GET /v1/notes` (con filtro `created_after`) y `GET /v1/notes/{id}?include=transcript`.
  Devuelve metadata, resumen IA y transcript literal. Solo aparecen notas ya procesadas.
- Webhooks: NO hay. Toca polling. Rate limits: burst 25 req/5s, sostenido 5 req/s.
- Vías alternativas que siguen existiendo: API reverse-engineered
  (https://github.com/getprobo/reverse-engineering-granola-api), MCP servers de terceros
  que leen la cache local, y MCP oficial hosteado (`https://mcp.granola.ai/mcp`).

## 2. tl;dv (tldv.io)

- Developer API oficial: https://doc.tldv.io/index.html. Base `https://pasta.tldv.io`,
  version `v1alpha1` (alpha: puede cambiar).
- Auth: header `x-api-key`. La key la genera cada usuario en Settings -> Personal
  Settings -> API Keys.
- Endpoints: listar meetings, meeting por id, transcript, notes (estructurado y
  Markdown), highlights (deprecated a favor de notes), download de grabacion
  (signed URLs, expiran en 6h), import de meeting por URL.
- Webhooks: SÍ. Eventos `MeetingReady` y `TranscriptReady`, configurables a nivel
  User/Team/Org, endpoint HTTPS obligatorio.
- Plan: API solo en Pro, Business o Enterprise. Free no tiene. El acceso depende del
  plan del ORGANIZADOR del meeting.

## 3. Roam (ro.am) — Magic Minutes

- API oficial SÍ: https://developer.ro.am/ (Chat API en Alpha).
- `GET /transcript.info` (base `https://api.ro.am`): metadata, participantes, texto
  por hablante con offsets, el resumen Magic Minutes y action items. Scope
  `transcript:read`. Soporta polling de reuniones en vivo con `sinceOffset`.
- Webhooks oficiales: `transcript-started` y `transcript-saved` (minuta finalizada).
- Auth: Bearer (API key u OAuth). Los API clients los crea un ADMIN del Roam
  (Administration -> Developer -> Add ApiClient). Modo Personal: solo transcripts
  donde el usuario autenticado participó.
- Incierto: integración Zapier (mencionada en marketing, no verificada) y requisitos
  de plan para la API (la doc no los menciona).

## 4. Apollo.io

- CREAR secuencia por API: SÍ. `POST /api/v1/sequences` con nombre y `emailer_steps`.
  Requiere MASTER API key (403 sin ella). A/B testing en steps requiere plan con esa
  feature. Fuente: https://docs.apollo.io/reference/create-sequence
- Agregar contactos a secuencia existente:
  `POST /api/v1/emailer_campaigns/{sequence_id}/add_contact_ids` (requiere sequence id,
  contact ids y `send_email_from_email_account_id`). Tambien master key.
- Relacionados: buscar secuencias (`POST /api/v1/emailer_campaigns/search`), activar
  secuencia, actualizar estado de contacto en secuencia.
- La doc mezcla dos nombres de recurso: `sequences` (crear) y `emailer_campaigns`
  (gestionar). Ambos vigentes.
- Master key: Settings -> Integrations -> API Keys, toggle "Set as master key".
- Plan: la doc oficial solo dice "depende de tu plan", sin tabla. Fuentes terceras
  (no oficiales): acceso API avanzado en plan Organization; Basic/Professional muy
  limitado. NO verificado oficialmente.
- Rate limits: no publicados; se consultan por endpoint de usage stats (tambien master
  key). Los endpoints de secuencias NO consumen creditos; los de enriquecimiento si.

## 4b. Apollo — verificación profunda (contactos propios, personalización, tracking)

Verificado 2026-07-03 contra doc oficial (docs.apollo.io y knowledge.apollo.io).

### Contactos y empresas propias
- `POST /api/v1/contacts` crea contactos con data PROPIA (nombre, email, empresa,
  telefonos, custom fields). NO consume creditos.
  https://docs.apollo.io/reference/create-a-contact
- Dedup opcional con `run_dedupe: true` (busca por email/nombre y devuelve el
  existente en vez de duplicar).
- Bulk: hasta 100 contactos por request.
  https://docs.apollo.io/reference/bulk-create-contacts
- Empresas: `POST /api/v1/accounts` (master key, sin creditos).
  https://docs.apollo.io/reference/create-an-account

### Personalización
- Variables dinamicas: basicas ({{first_name}}...), avanzadas (condicionales y
  fallbacks) y custom.
- Custom fields por contacto: se crean en UI o por API (`POST /api/v1/fields`,
  modality contact/account/opportunity) y generan variable dinamica usable en
  secuencias. Acceso a custom fields depende del plan.
- Paso "manual email": SI existe. El email NO se manda solo; cae como tarea, se
  abre, se EDITA por contacto, y se manda o se programa. Es la revision pre-envio.
  https://support.apollo.io/hc/en-us/articles/115003685771
- Hora de envio de pasos automaticos: "sending schedules" por secuencia, por
  timezone (incluso el del contacto), configurable por dia.

### Tracking (lo de MailSuite)
- Opens: pixel. Clicks: link rewriting (recomiendan subdominio de tracking custom).
- Replies: por default el contacto sale de la secuencia al responder (ruleset
  desactivable); tambien pausa por out-of-office y finaliza si agenda reunion.
- LECTURA POR API: SI, dos endpoints (master key, sin creditos):
  - `GET /api/v1/emailer_messages/search`: filtra por delivered/opened/clicked/
    bounced/scheduled, por secuencia, fecha, usuario y clase de reply.
    https://docs.apollo.io/reference/search-for-outreach-emails
  - `GET /api/v1/emailer_messages/{id}/activities`: detalle completo de un email
    (contenido, opens, clicks, contacto).
    https://docs.apollo.io/reference/check-email-stats

### Envío
- Sale del buzon del usuario (Gmail/Outlook por OAuth, o SMTP via Nylas). El
  `send_email_from_email_account_id` de add_contact_ids define el buzon.
- Limites de envio configurables por mailbox; topes duros los pone el proveedor
  (Google: 400/hora, 2.000/24h por buzon), no el plan de Apollo. Recomiendan
  arrancar ~50/dia por buzon (warming).

### Lo que sigue sin verificar oficialmente
- Plan minimo exacto por endpoint (la doc solo dice "depende de tu plan").
- Rate limits por plan (solo consultables en runtime).
- Limite total de contactos propios almacenables por plan.
- Terceros (no oficial): Free = 2 secuencias activas; pagos sin limite.
- Para confirmar contra la cuenta real de OnePay: autorizar el conector MCP de
  Apollo (plugin sales:apollo) y probar los endpoints con la key propia.

## 5. Dato de cuenta real (2026-07-03)

- Plan de Apollo de OnePay: **Professional (Monthly), $99/mes, 1 seat,
  4.000 creditos/mes** (screenshot de Sebastian). Renueva el 26 de julio.
- La incognita ya no es "que plan se necesita" sino "que endpoints habilita
  Professional". Verificable en vivo creando una master API key
  (Settings -> Integrations -> API Keys) y probando los endpoints de secuencias.

## 6. La vara: lo que el playbook exige del motor (PDF Piramide y Cadencia)

Campana outbound a ISPs, segmentada: en-hold sin info (~100), Tier 1 >3.000u
(~100), Tier 2 1.000-3.000u (~400-500), Tier 3 <1.000u (~600).

- Tier 1 (Playbook A, Full ABM): cadencia de 24 dias, 10 correos verbatim +
  9 WhatsApp + 5 llamadas + 3 LinkedIn opcionales + referido dia 0.
  Intake 8 cuentas nuevas/dia. Hiperpersonalizacion con revision humana.
- Playbook B (Tier 1 sin numero del gerente): break-in anti-gatekeeper
  (PBX, correo al dominio, LinkedIn, WhatsApp linea de negocio, round-robin);
  al conseguir el directo salta a A.
- Tier 2 (Playbook C, Light): la misma cadencia recortada hasta el dia 7.
  Intake 10-12/dia.
- Tier 3 (Playbook D): correo masivo con IA, minimo costo. Intake 100-150/dia.

Requisitos duros derivados: contactos propios por API; multicanal con correo
automatico y llamada/WhatsApp/LinkedIn como tareas manuales visibles como
"toques de hoy"; revision/edicion por contacto pre-envio (Tier 1); tracking
opens/clicks/replies legible por API; reply detection que frena la cadencia
(y freno manual tras una llamada); cero toques perdidos con visibilidad de
atrasados. Objetivo unico: ningun toque se pierde un dia.

## 7. Research final (deep-research, verificado adversarial, 2026-07-03)

Nota: el research se corto dos veces por limite de gasto mensual (no de tiempo).
Lo de abajo es lo que sobrevivio verificacion 2-1 o 3-0. No hubo sintesis final
(fallo por el mismo limite); esto es la lista de hechos, sin narrativa armada.

**Apollo (confirma lo ya sabido, mas fino):**
- `add_contact_ids` exige master key. El parametro obligatorio es
  `send_email_from_email_account_id` (por correo) — no hay mencion de pasos de
  llamada/LinkedIn/tarea en ESTE endpoint especifico (2-1, matizado: la doc de
  Apollo en otro lado si describe esos pasos a nivel de secuencia UI, ver research
  anterior; lo que no soporta este endpoint puntual es agregarlos por API).
- `emailer_messages/search` exige master key (3-0). Refutado en un intento: la
  version que afirmaba que expone TODOS los filtros (delivered/opened/clicked/
  bounced/spam/reply-sentiment) no paso el voto adversarial completo — hay que
  confirmarlo endpoint por endpoint en vivo, no darlo por sentado en bloque.

**MailSuite: confirmado sin salida.** CSV manual, tope 1000 correos/seccion,
Zapier solo Advanced. Dos intentos de decir "no hay API en absoluto" fueron
refutados por matiz (existe Zapier, aunque limitado) pero el resultado practico
es el mismo: no hay tracking legible por API real.

**Reply.io:** su API v3 SI documenta pasos multicanal (email, LinkedIn, llamada,
tarea manual) dentro de la misma secuencia (3-0). No se alcanzo a verificar precio
ni el detalle de lectura de esas tareas por API.

**Lemlist — el hallazgo mas fuerte del research:**
- Tiene una sola API de "Activities" que expone TODOS los canales por el mismo
  endpoint: `emailsSent/Opened/Clicked/Replied`, `linkedinSent/Replied`,
  `whatsappMessageSent/Delivered/Opened/Replied`, `aircallCreated/Done` (llamadas
  via integracion Aircall, con duracion y grabacion), y `manualDone/Interested/
  NotInterested` (tareas manuales). Fuente: developer.lemlist.com + 
  help.lemlist.com/en/articles/9423940 (3-0 en la mayoria de sub-claims).
- WhatsApp es paso nativo real (no Zapier): cuenta vinculada por QR, con
  seguimiento automatico de enviado/entregado/visto/respondido. Costo: add-on
  ~$20/mes sobre el plan Multichannel Expert ($99/mes) o Enterprise.
- Contraparte que quedo refutada/sin cerrar: si el API de acceso basico esta
  gateado desde el plan Email Pro ($79/user/mes) o si el multicanal completo
  exige el plan de $99. Esto quedo en disputa entre dos intentos de verificacion
  (uno lo confirma, el otro lo refuta) — VERIFICAR EN VIVO antes de decidir.
- Llamadas SI quedan trackeadas por API, pero solo si pasan por la integracion
  Aircall (no es llamada generica).

**Smartlead:** API descrita como solo-correo (2-1, matizado). Si trackea opens/
clicks/replies por API con inbox unificado (3-0). Sin soporte nativo de
WhatsApp/llamada/LinkedIn como pasos de secuencia.

**Unipile (agregador, no motor de secuencias):** ofrece WhatsApp + LinkedIn +
Instagram + Email + Telegram por API unificada (3-0). Precio por cuenta
conectada: minimo 49 EUR/mes (hasta 10 cuentas), luego ~5 EUR/cuenta/mes hasta 50.
Es la pieza que conectaria canales a una herramienta propia (patron headless),
NO un motor de cadencias con UI — la logica de secuencia la pondrias tu.

**Rasayel:** GraphQL + REST documentados, pero el voto quedo empatado 1-1 (no
concluyente); resto de afirmaciones no alcanzaron a verificarse (unverified).

**TimelinesAI:** afirmaciones de precio ($25/seat CRM Integration, $40 Shared
Inbox, $60 Mass Messaging) y de API/webhooks incluidos en todos los planes
quedaron sin verificar (limite de gasto cortó antes del voto).

### Lectura para tu hoja (hechos, no recomendacion)
- Apollo: fuerte en correo + tracking de correo: debil/nulo en llamada, WhatsApp,
  LinkedIn por API (esos quedan como tarea generica, sin lectura fina).
- MailSuite: sin camino API viable. Descartable como motor de tracking.
- Lemlist es la UNICA opcion evaluada con una sola API que cubre los 4 canales
  del playbook (correo, WhatsApp, llamada via Aircall, LinkedIn) con tracking
  legible en el mismo endpoint. El precio y el gating exacto por plan quedan
  pendientes de confirmar en vivo (ver arriba, es lo unico que falta cerrar).
- Si el camino es "motor headless" (tu herramienta pone la logica de cadencia),
  Unipile es la pieza de canales (WhatsApp/LinkedIn/email) mas barata que armar
  Aircall+Lemlist+Apollo sueltos, pero no trae UI de secuencia ni tracking de
  email tan maduro como los otros.

## 8. El Playbook completo (transcrito del PDF "Piramide y Cadencia")

Documento fuente: `Playbook - Piramide y Cadencia (rediseno) copy.pdf` (11 paginas),
compartido por Sebastian. Es la vara que el motor de cadencia tiene que poder
ejecutar. Transcrito completo para que quede en el mismo lugar que el research
tecnico, sin tener que volver al PDF.

### Propuesta: Campana de Outbound a ISPs
Tocar todo el universo de ISPs con un primer toque para la ultima semana de
julio, y cerrar los grandes (Tier 1) antes de fin de mes. Arranca esta semana
por los ~100 en hold; el resto entra por tier con intake diario.

### 01 · Punto de partida
La segmentacion ya esta hecha por tamano.

| Bucket | Tamano | Cuentas (aprox.) |
|---|---|---|
| En hold, sin info | Sin segmentar todavia | ~100 |
| Tier 1 | Mas de 3.000 usuarios (top ~100) | ~100 |
| Tier 2 | 1.000 a 3.000 usuarios | ~400-500 |
| Tier 3 | Menos de 1.000 usuarios | ~600 |

Los conteos por tier se llenan con la lista real. El hold (~100) es el que arranca.

### 02 · Barrido de los que estan en hold
Todos los toques hechos de aqui al viernes. Si tienen un call, llamar para
saber por que no toman el servicio.

| Dia | Toque |
|---|---|
| Miercoles | Llamada, WhatsApp, buscar correo |
| Jueves | Enviar correo |

### 03 · Empezar campana

| Tier | Que corre | Cuentas nuevas/dia |
|---|---|---|
| Tier 1 (top ~100) | Playbook A - Full ABM (o B si solo gatekeeper) | 8 |
| Tier 2 (1.000-3.000) | Playbook C - Light, entremedios | 10-12 |
| Tier 3 (menos de 1.000) | Playbook D - IA, correo masivo | 100-150 |

### Piramide de esfuerzo por Tier
Cuanto se invierte en cada tier y con que.

- **Tier 1 · Top 100, las mas grandes** (pocas, alto toque, humano): ABM 1:1.
  Correo personal, WhatsApp (voz/video), llamada, LinkedIn y visita. Objetivo:
  reunion, caerles como sea.
- **Tier 2 · 1.000 a 3.000**: Light. Correo con merge, llamada y bubble-up. Sin
  WhatsApp manual. Una llamada suele caer.
- **Tier 3 · Menos de 1.000** (muchas, bajo toque, IA): automatizacion barata.
  Correo y llamada con IA. Todo IA, minimo costo. Volumen.

### Playbook A · Tier 1 · Cadencia completa (Full ABM)
WhatsApp + Correo + LinkedIn + Llamadas, de inicio a fin. Los 10 correos y los
9 WhatsApp van VERBATIM. LinkedIn es opcional (metodo 30MPC). En las llamadas
no hay script, solo el objetivo. Total: 24 dias, 10 correos, 9 WhatsApp,
5 llamadas, 3 LinkedIn opcionales, 1 referido opcional dia 0.

| Dia | Canal | # | Contenido / objetivo |
|---|---|---|---|
| 0 | Referido (opcional) | Toque 0 | Objetivo: conseguir intro caliente de un cliente que conozca al gerente. Si la tienes, empiezas aqui. |
| 1 | Correo | 1 | Asunto "cobrar sin cortar". Abre con el patron (pagos tarde, corte como unico mecanismo), dato de +60 ISPs que ya resolvieron, cierre con propuesta de 15 min con un referente. |
| 1 | WhatsApp | 1 | Menciona Andinalink y que el jefe pidio contactar. Pide permiso para llamar ahora. |
| 1 | LinkedIn (opcional) | 1 | Solicitud de conexion en blanco, sin mensaje. |
| 2 | Llamada | 1 | Objetivo: problem prop + lograr reunion. |
| 2 | LinkedIn (opcional) | 2 | Seguimiento corto, referencia al correo. |
| 3 | WhatsApp | 2 | Angulo "buscando info de la empresa", pago por WhatsApp como diferencial (Movistar ya lo usa). Pide llamada corta. |
| 4 | Correo | 2 | Asunto "re: cobrar sin cortar". Recordatorio corto, pregunta si resuena. |
| 5 | Correo | 3 | Asunto "la plata que no llega". Refuerza el problema del corte, dato +60 ISPs, pide 15 min. |
| 6 | WhatsApp | 3 | Nota de voz (15-20 seg), mismo mensaje en audio. |
| 7 | Correo | 4 | Asunto "re: la plata que no llega". Rebote corto por si se perdio. |
| 7 | Llamada | 2 | Objetivo: retomar, ampliar el problem prop y buscar la reunion. Buzon si no contesta. |
| **corte** | | | **Hasta aqui llegan los plays cortos: Play C (Tier 2) y Play D (Tier 3). No se les manda el resto.** |
| 8 | Correo | 5 | Asunto "¿entro o no entro?". Angulo operativo: revisar comprobantes uno por uno, cargar pagos a mano. |
| 9 | WhatsApp | 4 | Video de 20-30 seg mostrando lo facil que paga un usuario. Pide llamada. |
| 9 | LinkedIn (opcional) | 3 | Referencia al correo, sin presion. |
| 10 | Correo | 6 | Asunto "re: ¿entro o no entro?". Bajo perfil: "si no es el momento, me dices y dejo de insistir". |
| 11 | Llamada | 3 | Objetivo: entrar por el angulo operativo (conciliacion) y pedir la reunion. |
| 12 | WhatsApp | 5 | Caso Movistar: suscripcion para flujo de caja predecible, 65% recaudado en primeros 5 dias. |
| 13 | Correo | 7 | Asunto "el que no vuelve". Angulo: clientes que se van por lo dificil de pagar, no por el servicio. |
| 15 | WhatsApp | 6 | Angulo conciliacion manual, "¿quien lleva ese tema alla?". |
| 15 | Llamada | 4 | Objetivo: ultimo empujon fuerte de telefono; pedir la reunion directo. |
| 16 | Correo | 8 | Asunto "sin tener que cortar". Mismo mensaje reforzado, misma logica que telco/credito. |
| 18 | WhatsApp | 7 | Angulo: lo caro no es la plata tardia, es el cliente que se va y no vuelve. |
| 19 | Correo | 9 | Asunto "cuanto cuesta cobrar". Costo real = personas persiguiendo pagos + horas revisando, no solo comision. |
| 21 | WhatsApp | 8 | Ultima idea: cartera vieja dada por perdida, se puede recuperar una parte. |
| 22 | Llamada | 5 | Objetivo: llamada de cierre, un si o un no. Acompanar con WhatsApp el mismo minuto. |
| 24 | Correo | 10 | Asunto "plata dada por perdida". Cierre: "¿lo retomamos o de plano lo cierro? Cualquiera me sirve." |
| 24 | WhatsApp | 9 | Cierre: "no quiero seguir insistiendo si no es el momento". |

Fin de la cadencia completa · Play A · Full ABM (Tier 1).

### Playbook B · Tier 1 · Break-in (sin numero del gerente)
Solo hay PBX o numero publico. La meta NO es vender: es conseguir el directo o
el WhatsApp del gerente. Apenas se consigue, se salta al Playbook A.

| Dia | Canal | Paso / objetivo |
|---|---|---|
| 1 | Referido | Paso 1, mirar quien nos puede conectar. Objetivo: antes de llamar al conmutador, revisar la cartera de clientes y contactos por si alguien conoce al gerente. Si aparece, entras por ahi y te saltas el frio. |
| 1 | Llamada | Llamada al PBX, gatekeeper. Objetivo: que te pasen al gerente o te den su directo/WhatsApp. |
| 1 | Correo | Correo al gerente, si das con el patron del dominio. Usa el Correo 1 de la cadencia A ("cobrar sin cortar"). |
| 2 | LinkedIn (opcional) | Conexion + contexto: "trabajo con ISP de zona, no vengo a venderte, te deje un correo". |
| 3 | Correo | Correo de informacion, si el gatekeeper pide "mandame un correo". Asunto "recaudo para [empresa]", dirigido a "Nombre del gerente" si se consiguio. |
| 4 | Llamada | Llamada al PBX, otra hora. Objetivo: pedir el reenvio o el WhatsApp directo del gerente. |
| 6 | WhatsApp (opcional) | A la linea de negocio. Objetivo: usar la linea de negocio como otra puerta para que enruten al gerente. No es un toque personal, es otra forma de tocar el conmutador. |
| 8 | Llamada | Round-robin, si hay varios numeros publicos. Objetivo: probar cada linea hasta dar con un humano que te enrute. |

(El PDF corta aqui; si Playbook B tiene mas pasos despues del dia 8, o si los
Playbooks C y D tienen su propio detalle dia a dia, faltan por transcribir —
Sebastian solo compartio hasta la pagina 11.)

## 9. El core de la herramienta hoy — que funciona y que falta

Diagnostico hecho al arrancar esta conversacion, contra el codigo real de
`followups-tool` (Next.js + Drizzle sobre isps.db) y contra `planning/spec.md`
y `planning/tasks.md` (los planes ORIGINALES, antes del pivote de alcance de
la seccion 0).

**Ya funciona (T1-T6, el walking skeleton):**
- Cola del dia por owner, ordenada por calor de la cuenta (`app/db/repository.ts`
  `colaDelDia`).
- Ficha de cuenta: contacto principal, los 3 imprescindibles (usuarios/CRM/
  pasarela) con "sacar en la llamada" si falta, ultimos toques (`getCuenta`).
- Registrar toque atomico: escribe el toque + actualiza empresa (proximo
  follow-up, crm, pasarela, usuarios) en una transaccion, log en `sync_cambios`
  (`registrarToque`).
- Repartir follow-ups: N por dia habil, lo mas caliente primero
  (`repartirFollowups`).

**No existe, cero codigo (confirmado por grep):**
- **GranolaAdapter + ingest worker** (T7-T8): nadie lee sesiones de Granola,
  nadie enlaza con el matcher (`empresa_alias`), nadie escribe
  `transcript_proveedor/id/url`. Esas columnas existen en el schema pero nadie
  las llena. Toda la captura hoy es 100% manual por el `CaptureForm`.
- **Sync a Notion** (T10-T12): no hay `NotionAdapter` ni `ClaudeAdapter` ni
  patron Outbox. `sync_cambios` se escribe como log pero no dispara ninguna
  subida. Notion se llena hoy a mano con la skill `notion-real-onepay`.

**Gaps menores (T6, T9):**
- Canal del toque hardcodeado a "llamada" en `registrarToque`; el selector del
  form solo fija el canal del PROXIMO toque, no el del toque actual.
- Resultado sin granularidad: solo contesto/no-contesto. La spec pide
  contesto-reunion / contesto-sigo / contesto-no / no-contesto.
- Falta capturar Razon de Perdida (en "contesto-no") y KDM nombre+tel
  (gatekeeper).
- Ficha sin tipo de toque (warm/reactivacion/cliente/wispro) ni website.

## 10. Decision pendiente — lo que se esta evaluando

Esto es lo que sigue abierto, sin resolver todavia:

1. **El pivote de alcance mismo.** La constitucion y `planning/spec.md`
   originales dicen: un solo usuario, Granola como unico grabador, cadencia
   automatica FUERA de v1. Lo que se esta evaluando ahora (auth multi-usuario,
   pagina de conectores, cadencias/campanas como centro de la app) es un
   pivote real. La hoja `planning/hoja-plan-v2.md` es donde eso se decide
   explicitamente antes de tocar codigo — sigue sin llenar.

2. **Quien ejecuta la cadencia de correo.** Cuatro caminos, con los hechos de
   las secciones 1-8 ya en la mesa, sin recomendacion todavia:
   - **Apollo** (ya pagado, $99/mes): fuerte en correo + tracking de correo,
     pero el endpoint de agregar contactos a secuencia no soporta llamada/
     LinkedIn como pasos por API; WhatsApp no es canal nativo en ningun lado.
   - **Lemlist**: unica opcion con una sola API que cubre los 4 canales del
     playbook (correo, WhatsApp nativo, llamada via Aircall, LinkedIn) con
     tracking legible en el mismo endpoint. Precio y gating exacto por plan
     sin confirmar en vivo todavia (~$99-119/mes + addon WhatsApp).
   - **MailSuite + herramienta propia**: descartado como motor de tracking
     (sin API real). Construirlo en casa exige pixel/redirects propios, que a
     su vez exige hosting publico (hoy la app es local con SQLite) — arrastra
     Turso/hosting, que estaba pensado para fase 2.
   - **Headless con Unipile**: la herramienta pone toda la logica de cadencia
     y Unipile solo agrega los canales (WhatsApp/LinkedIn/email) por API,
     mas barato que armar Aircall+Lemlist+Apollo sueltos, pero sin UI de
     secuencia ni tracking de correo tan maduro.

3. **Como conecta Apollo con contactos PROPIOS.** Ya resuelto con hechos
   (seccion 4b): SI se puede (`POST /api/v1/contacts`, sin costo de creditos,
   bulk de 100). Lo que falta es probarlo contra la cuenta REAL de OnePay
   (crear una master API key y probar create-contact + add-to-sequence +
   lectura de tracking) para cerrar la duda de que endpoints deja exactamente
   el plan Professional.

4. **El B2 de la hoja** (¿la herramienta ENVIA o solo REGISTRA?) sigue siendo
   la pregunta que Sebastian tiene que responder antes de que Claude genere su
   plan independiente — es la decision que define cual de los 4 caminos de
   arriba hace sentido.
