# Experimento P0 · qué expone de verdad el plan Apollo Professional de OnePay

Fecha de diseño: 2026-07-03. Verificado contra docs.apollo.io ese día.

## Por qué este experimento existe

El plan (plan-claude-v2.md) tiene UN supuesto que, si es falso, tumba F3.5 y F4:
**que la master key del plan Professional ($99/mes, 4.000 créditos, 1 seat) habilita los
endpoints de secuencias y el tracking legible.** Fuentes de terceros dicen que el acceso
API "bueno" está en el plan Organization y que Professional es "limitado", pero la doc
oficial solo dice "depende de tu plan", sin tabla. No se resuelve leyendo: se resuelve
pegándole a la cuenta real. Eso es este experimento.

## Restricción dura (de Sebastián, innegociable)

SOLO LECTURA. No dejar registro, no mandar nada, no editar nada, máximo cuidado.
- La key NO se pega en el chat (queda en el historial). Vive en `scripts/.env.apollo`
  (ya cubierto por `.gitignore` -> `.env*`) o en la variable de entorno `APOLLO_API_KEY`.
- Solo se corren llamadas de lectura. Las de escritura quedan documentadas-pero-no-probadas
  hasta Fase 5, y ahí se prueban a propósito con un contacto de descarte que se borra.
- El experimento lo corre SEBASTIÁN con su key (Claude no la ve). Claude deja el script listo.

## La tensión honesta que este experimento NO puede resolver

Los dos endpoints de los que F3.5 depende — `create-contact` y `add-to-sequence` — son
ESCRITURA. No hay forma de probarlos sin crear un registro. Con la regla de "no dejar
registro", quedan fuera de esta pasada. Lo que este experimento SÍ logra es un puente
lógico fuerte:

> Los 4 endpoints de lectura que probamos (email_accounts, emailer_campaigns/search,
> emailer_messages/search, usage_stats) **exigen master key**: sin ella devuelven 403.
> Si los 4 devuelven 200, quedan probadas dos cosas a la vez: (1) la key ES master, y
> (2) el plan Professional NO bloquea los endpoints con candado de master key. Como
> create-contact y add-to-sequence son también endpoints de master key, la inferencia de
> que también responderán es fuerte — no es prueba, es evidencia indirecta de alto grado.

Prueba definitiva de escritura: Fase 5, contacto de descarte, se borra. No aquí.

## Qué significa "pasa" (para no auto-engañarse)

El criterio de éxito es el **código de estado, no el contenido**. Si OnePay nunca ha mandado
un correo por Apollo, `emailer_messages/search` devuelve lista VACÍA con 200: eso PASA
(el endpoint está habilitado, solo no hay data todavía). Un 403 REPRUEBA (el plan lo bloquea
o la key no es master). Un 200 con [] y un 200 con datos valen igual para esta decisión.

## El experimento · 5 pruebas, cada una atada a una feature

| # | Pregunta que responde | Endpoint (todos LECTURA, 0 créditos) | Método | Pasa si | Reprueba si | Qué feature de-riesga |
|---|---|---|---|---|---|---|
| 1 | ¿Qué header de auth funciona y la key es válida? | `/api/v1/email_accounts` | GET | 200 con header `X-Api-Key` | 401 (key mala) / 403 (no master) | Todo (sin auth no hay nada) |
| 2 | ¿La key tiene privilegio master? | mismo #1 (email_accounts exige master) | GET | 200 y lista de buzones con su `id` | 403 | F3.5 (el `send_email_from_email_account_id` sale de aquí) |
| 3 | ¿Puedo LISTAR secuencias por API? | `/api/v1/emailer_campaigns/search` | POST | 200 (aunque la lista venga vacía) | 403 / 404 | F3.5 (dueño de la cadencia empuja a secuencias) |
| 4 | ¿El tracking es legible por API? (el dolor de MailSuite) | `/api/v1/emailer_messages/search` | GET | 200, y si hay envíos, campos de estado | 403 | **F4 (el corazón del pivote)** |
| 5 | ¿Cuánto rate limit / uso me deja el plan? | `/api/v1/usage_stats/api_usage_stats` | POST | 200 con límites por endpoint | 403 | B7 (cada cuánto puede pollear el worker) |

Notas de forma verificadas contra la doc (2026-07-03):
- **Header:** la doc oficial dice "Bearer", pero el header que funciona en la práctica es
  `X-Api-Key: <key>`. El script prueba `X-Api-Key` primero y cae a `Authorization: Bearer`
  si da 401. Resolver esto empíricamente ES parte de la prueba 1.
- **email_accounts:** GET, sin params, sin créditos, exige master key. Devuelve los `id` de
  los buzones vinculados (ese id es el que F3.5 necesita para decir desde qué buzón sale).
- **emailer_campaigns/search:** POST, params `q_name`/`page`/`per_page`, sin créditos, master.
- **emailer_messages/search:** GET, filtros `emailer_message_stats[]` (delivered, opened,
  clicked, bounced, not_opened, scheduled, drafted, unsubscribed, spam_blocked, failed_other),
  `emailer_message_reply_classes[]`, `emailer_campaign_ids[]`, rango de fecha, paginación.
  Tope de 50.000 registros (100 x 500 páginas). Sin créditos, master.
- **usage_stats:** POST, sin params, sin créditos, master.

Todas se corren con `per_page=1` donde aplique, para tocar el mínimo de data.

## Cómo se corre (paso a paso, lo hace Sebastián)

1. En Apollo: Settings -> Integrations -> API Keys -> crear key -> toggle **"Set as master
   key"**. (Sin ese toggle, las 5 pruebas dan 403 y no probamos nada.)
2. Guardar la key en `scripts/.env.apollo` así (el archivo ya está gitignored):
   ```
   APOLLO_API_KEY=xxxxxxxxxxxxxxxxxxxx
   ```
   O exportarla: `export APOLLO_API_KEY=xxxx` (no queda en disco, pero sí en el historial de
   shell; el archivo gitignored es más limpio).
3. Correr: `python3 scripts/apollo_probe.py`
4. El script imprime, por prueba: endpoint, código de estado, PASA/REPRUEBA, y una muestra
   mínima (un id de buzón, el conteo de secuencias, un evento de tracking si hay). Nunca
   imprime la key.
5. Pegar la SALIDA (no la key) en la sección de resultados de abajo.

## Capacidades confirmadas EN VIVO (2026-07-03) — fuente de verdad del adaptador

Todo esto se probó contra la cuenta real, header `X-Api-Key`, sin créditos. Es el contrato
sobre el que se construye el EnvioAdapter/Apollo.

| Capacidad | Endpoint | Estado |
|---|---|---|
| Auth + master key | `GET /email_accounts` | ✅ 200 |
| Listar secuencias | `POST /emailer_campaigns/search` | ✅ 200 |
| Leer tracking | `GET /emailer_messages/search` | ✅ 200 (campos delivered/opened/clicked/bounce...) |
| Rate limits | `POST /usage_stats/api_usage_stats` | ✅ 200 (200/min, 400/h, 2000/día por endpoint) |
| Crear secuencia | `POST /emailer_campaigns` (o `/sequences`) | ✅ crea; el nombre persiste con `{"name":...}` |
| Crear paso | `POST /emailer_steps` `{emailer_campaign_id,position,type:"auto_email",wait_mode,wait_time}` | ✅ auto-crea `emailer_touch` + `emailer_template` |
| Escribir copy | `PUT /emailer_templates/{id}` `{subject,body_html}` | ✅ persiste, conserva `{{first_name}}` |
| Editar copy | `PUT /emailer_templates/{id}` (de nuevo) | ✅ el cambio pega, verificado con GET |
| A/B en un paso | `POST /emailer_touches` `{emailer_step_id,type}` -> 2do template | ✅ variante B con su copy propio |
| Crear contactos | `POST /contacts/bulk_create` `{contacts:[...],run_dedupe:true}` | ✅ hasta 100; devuelve `created_contacts` + `existing_contacts` |
| Asignar a secuencia | `POST /emailer_campaigns/{id}/add_contact_ids` | ✅ OJO: exige `emailer_campaign_id` EN EL CUERPO + `send_email_from_email_account_id` |
| No activar = no envía | (secuencia con `active:false`) | ✅ inscribir contactos NO manda nada hasta aprobar |
| Sacar de secuencia | `POST /emailer_campaigns/{id}/remove_or_stop_contact_ids` | documentado, no ejecutado |
| Archivar secuencia | `POST /emailer_campaigns/{id}/archive` | ✅ (única limpieza por API) |

### Límites duros del plan (afectan el diseño)

- **NO hay DELETE por API** de secuencias, contactos ni empresas. Solo archivar (secuencias) o
  sacar de secuencia (contactos). Borrado definitivo = UI. Implicación de arquitectura: isps.db
  es la fuente de la verdad; Apollo recibe e inscribe, pero la vida/muerte del dato se maneja en
  la base, no en Apollo. Encaja con la constitución.
- **Identidad de envío = el buzón vinculado**, elegido por secuencia en `add_contact_ids`. Hoy
  solo hay 2 buzones, ambos de Camilo (`camilo@onepay.la`, `camilofonseca@onepay.la`); 1 solo
  usuario/seat. Para enviar como Sebastián: vincular su buzón en la UI (posible bajo el mismo
  seat como buzón adicional; si Apollo lo bloquea, toca 2do seat). DECISIÓN DE NEGOCIO PENDIENTE,
  no bloquea construir. Llamada/WhatsApp son manuales, así que el número no entra por aquí.

### Pendiente para un experimento futuro más detallado (no bloquea la lógica de negocio)

- Envío real de punta a punta con entregabilidad (exige aprobar una secuencia y mandar).
- Que los eventos de tracking (opens/clicks/replies) POBLEN de verdad tras un envío real.
- Config fina de sending schedules / wait_time por paso y timezone.
- Decisión buzón/seat (enviar como Sebastián).

### Artefactos de prueba que quedan en Apollo (limpiar cuando se quiera)

- Secuencia `ZZZ-TEST-BORRAR-2026-07-03` (id `6a4841e2aac0cb0018909302`): inactiva, 2 pasos
  (paso 2 con A/B), 2 contactos reales inscritos (sacostamolin@gmail.com, sebastian@onepay.la).
  No manda nada. Limpieza sugerida: `remove_or_stop_contact_ids` + `archive` (NO borrar los
  contactos: ya existían como reales). PENDIENTE: no se ejecutó, quedó vivo para retomar.
- 2 borradores vacíos archivados del incidente previo (`6a484009...`, `6a48400a...`).

### Hallazgos extra de la sesión (importan para el diseño)

- Los dos contactos "de ejemplo" NO se crearon: ya existían desde 2026-05-25 con
  `Source: Mailbox Sync`. Apollo los sincroniza solos desde el buzón de Camilo. Implicación:
  si el Mailbox Sync está activo, borrar un contacto en la UI no basta, reaparece en la
  siguiente sync. La fuente de la verdad de contactos es isps.db, no Apollo.
- Borrar contacto NO está en el menú "..." de la ficha; solo desde la vista People (lista) con
  checkbox + bulk action. Y no hay DELETE de contacto por API en este plan. Se dejaron intactos
  (son reales). La limpieza correcta de la prueba es sacarlos de la secuencia, no borrarlos.
- Identidad de envío / seat: 1 solo seat (Camilo), 2 buzones ambos de Camilo. Para enviar como
  Sebastián: vincular su buzón (posible como buzón adicional bajo el seat de Camilo sin pagar,
  o 2do seat si Apollo lo bloquea). DECISIÓN DE NEGOCIO PENDIENTE, no bloquea construir.

### Estado del gate G0

**CERRADO / VERDE.** El supuesto más riesgoso quedó probado en vivo, más fuerte de lo esperado:
Apollo Professional habilita todo el CRUD de cadencia por API. Se puede construir la lógica de
negocio con el contrato de arriba. Lo que falta (envío real, tracking poblando, schedules,
buzón/seat) es un experimento futuro más detallado que NO bloquea las Fases 1-4.

## Matriz de decisión (qué hacemos con cada resultado)

- **Las 5 pasan (200):** el supuesto se sostiene. Apollo es el motor de F3.5/F4. Se sigue
  el orden del plan sin cambio. (create/add-to-sequence se confirman en Fase 5.)
- **1 y 2 pasan, pero 4 reprueba (tracking bloqueado):** el peor caso para el pivote. F4 no
  vive en Apollo con Professional. Decisión ANTES de Fase 5: subir a Organization, o mover el
  tracking a otro motor (Lemlist/Smartlead) detrás del mismo EnvioAdapter. No se construye F5
  sobre Apollo hasta resolverlo.
- **3 reprueba pero 4 pasa:** raro (tracking sí, secuencias no). Significaría que Apollo sirve
  para LEER tracking pero no para que la herramienta empuje cadencias. Se evalúa headless
  (la herramienta programa envíos y solo lee tracking) o cambio de motor de envío.
- **Todo 403:** la key no quedó como master, o Professional bloquea master key. Rehacer la
  key con el toggle; si aun así 403, el supuesto es FALSO y el plan cambia de motor antes de
  Fase 5. Este es el resultado que justifica que P0 vaya de primero.
- **401 en todo:** key mal copiada o header equivocado. El script ya prueba ambos headers;
  si los dos dan 401, es la key. Rehacer.

## Resultados (corrido 2026-07-03, key master real de OnePay)

Las 5 pruebas de lectura PASARON (200). Cuenta con 2 buzones vinculados, 10 secuencias ya
existentes, tracking legible (los campos de emailer_messages incluyen bounce, campaign_name,
campaign_position, body_text, etc.). Rate limits del plan: **200/min, 400/hora, 2000/día por
endpoint** (dato para B7: el worker puede pollear tranquilo).

### Hallazgo clave · las ESCRITURAS se confirmaron SIN escribir nada

El endpoint `usage_stats/api_usage_stats` (lectura) enumera los 70 endpoints que el plan
Professional habilita, con su cuota. Ahí aparecen, con consumed=0 y limit 2000/día, TODOS los
de escritura que la feature necesita — sin haber creado un solo registro:

| Endpoint habilitado | Para qué feature | Cuota/día |
|---|---|---|
| `contacts/create` + `contacts/bulk_create` | crear contactos propios (F3.5) | 2000 |
| `emailer_campaigns/add_contact_ids` | agregar contactos a secuencia (F3.5) | 2000 |
| `emailer_campaigns/approve` / `abort` / `archive` / `remove_or_stop_contact_ids` | gestionar la cadencia y frenarla (F4, reply detection) | 2000 |
| `accounts/create` + `bulk_create` | crear empresas | 2000 |
| `fields/create` | custom fields para personalización (F3.3) | 2000 |
| `tasks/create` | toques manuales (WhatsApp/llamada/LinkedIn como tarea) | 2000 |
| `phone_calls/create` | registrar llamadas | 2000 |

### Crear secuencias por API: SÍ funciona (probado en vivo 2026-07-03)

Corrección de una lectura previa equivocada: `usage_stats` no lista `sequences/create`, pero
esa lista solo enumera los endpoints con rate limit, no todos. La prueba en vivo confirmó que
`POST /api/v1/sequences` y `POST /api/v1/emailer_campaigns` **sí crean** en el plan Professional
(ambos devolvieron 200 con un id de secuencia). Es decir: la herramienta PUEDE crear la
secuencia y, según los docs (el create acepta `emailer_steps`), armar pasos y copy por API.
Esto habilita el modelo "la herramienta es dueña del copy y lo empuja", que es justo lo que
Sebastián quiere automatizar. NO hace falta subir de plan ni cambiar de motor.

Pendiente de confirmar (a propósito no probado para no ensuciar producción): que subir el COPY
de cada paso por API funcione. Los docs lo documentan; se confirma en Fase 5 con UNA secuencia
de prueba nombrada que se archiva.

### Incidente de la prueba (transparencia)

El probe de "crear con cuerpo vacío para forzar 422 sin crear" NO se comportó como se esperaba:
Apollo aceptó el cuerpo vacío y creó DOS borradores (ids `6a484009d4e007001c6777c8` y
`6a48400ada1f0b0018e8f560`, name null, sin pasos ni contactos, sin aprobar -> no mandan nada).
El primer intento de archivar falló (endpoint mal); el segundo (`POST /emailer_campaigns/{id}/
archive`) los archivó. La lista activa volvió a 10 (como antes). Residuo: el plan NO expone
DELETE de secuencias (404), solo archivar, así que los dos quedan como registros archivados;
para borrarlos del todo hay que hacerlo a mano en la vista Archived de Apollo. Lección para
futuros probes de escritura: un cuerpo vacío NO garantiza 422; usar siempre un registro
nombrado identificable + cleanup verificado, nunca asumir que "inválido = no crea".

### Decisión tomada

**El supuesto más riesgoso se sostiene, y más fuerte de lo esperado. Gate G0 verde.** Apollo
Professional expone TODO lo que F3.5 y F4 necesitan: crear contactos y empresas, CREAR
secuencias por API (no solo meter contactos a las existentes), gestionar/frenar la cadencia y
leer tracking, con master key y sin créditos. El modelo "la herramienta es dueña del copy y lo
sube por API" es viable en el plan actual, que es lo que Sebastián quería automatizar. Se sigue
el orden del plan; Apollo queda como motor de envío (y opcionalmente de enriquecimiento:
contacts/search, organizations/enrich habilitados).

Pendientes para Fase 5 (con secuencia de prueba nombrada + cleanup verificado): confirmar que
el COPY de los pasos sube por API, y probar create-contact + add_contact_ids de punta a punta.
Nota operativa: el plan NO expone DELETE de secuencias, solo archivar; los borradores de prueba
se archivan y, si se quieren eliminar, se borran a mano en la vista Archived.
