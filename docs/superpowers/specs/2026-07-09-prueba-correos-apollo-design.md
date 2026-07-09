# Prueba de correos end-to-end (Apollo) — Diseño

Fecha: 2026-07-09
Owner: Sebastián

## Objetivo

Probar que una campaña de correo sale de verdad por Apollo, punta a punta, y que el
tracking vuelve. Es la primera vez que el pipeline manda un correo real: hasta hoy todo
corrió con la secuencia sin aprobar, así que nada se envió (ver `planning/experimento-apollo.md`).

Este entregable valida **la tubería con copy default**. La personalización research-driven
queda diseñada al final pero se construye después, encima de la tubería ya probada
(decisión de orden confirmada por Sebastián: tubería primero).

## Estado actual (lo que YA existe, no reconstruir)

El pipeline de correo está casi entero:

- **Subir contactos**: `enviarPaso` hace `POST /contacts/bulk_create` (`run_dedupe:true`,
  nunca duplica) + `POST /emailer_campaigns/{id}/add_contact_ids` con el buzón
  (`send_email_from_email_account_id: APOLLO_MAILBOX_ID`).
- **Subir copy**: al lanzar, `crearCampanaExterna` crea la secuencia y `sincronizarCopy`
  sube cada paso (`POST /emailer_steps` + `PUT /emailer_templates/{id}`). Traduce
  `[nombre]` -> `{{first_name}}`. `calcularWaitApollo` (motor-cadencia.ts) SÍ está
  implementado; el comentario de `apollo.ts:220` que dice que "tira" quedó viejo.
- **Mandar**: el worker (`app/worker/index.ts`, cada 5 min) corre materializar ->
  `push:correo` (llama `enviarPaso`) -> poll de tracking.
- **Tracking propio (opens/clics)**: `/api/track/open` (pixel 1x1) y `/api/track/click`
  (redirect 302), inyectados en el copy al sincronizar. Correlacionan por
  `(proveedorCampanaId, email)`. Opt-in: solo se inyectan si `APP_BASE_URL` está seteada.
- **Tracking vía poll de Apollo**: `leerEventosNuevos` pagina `emailer_messages/search`
  y mapea `enviado / respondió / rebotó`. Apollo NO expone opens/clics con fecha, por eso
  esos dos los da el pixel propio (conjuntos disjuntos, no se duplican).

## Huecos reales que bloquean un envío de verdad

1. **`approve` no está implementado.** Inscribir con la secuencia sin aprobar no manda
   nada (confirmado, experimento G1). El adaptador no tiene `approve`. Es a la vez el
   hueco y la compuerta de seguridad natural.
2. **`APP_BASE_URL` vacía.** El pixel/links apuntan ahí; Gmail/Outlook no le pegan a
   localhost. Se resuelve con un túnel `ngrok` (ya instalado) durante el test.
3. **Buzón.** `APOLLO_MAILBOX_ID` no está seteado. Sebastián vincula SU propio buzón en
   la UI de Apollo (OAuth) antes del test; luego se resuelve su `email_account_id` por API.
4. **Credencial en el conector.** El adaptador lee la API key de la DB encriptada
   (`leerCredencialConector('apollo')`), no de env. Hay que cargarla en `/conectores`
   desde `scripts/.env.apollo`.

## Principio de seguridad (no negociable)

Mandar NUNCA es automático al lanzar. El envío real lo dispara una acción explícita
("Aprobar y mandar"), separada de "Lanzar", que por debajo llama al `approve` de Apollo.
Alinea con el CLAUDE.md (nada sale sin revisión humana previa).

## Enfoque: probe primero, luego cablear

Mismo patrón con que el equipo validó el resto del adaptador (`scripts/apollo_probe.py`).
Los 4 desconocidos son de Apollo, no del producto; aislarlos en un script evita depurar
la UI y Apollo al mismo tiempo.

### Fase 0 — Prerrequisitos (compuertas manuales)

- Sebastián vincula su buzón en la UI de Apollo (OAuth Gmail/Outlook).
- Cargar la API key de Apollo al conector (`/conectores`, encriptada) desde
  `scripts/.env.apollo`.
- Resolver el `email_account_id` del buzón de Sebastián por API -> `APOLLO_MAILBOX_ID`.
- Levantar `ngrok` sobre `next dev`; `APP_BASE_URL` = URL https del túnel.

Pausa explícita antes de tocar credenciales reales / vincular buzón: eso lo hace Sebastián.

### Fase 1 — Probe script (de-riesgar Apollo)

Script contra Apollo con una secuencia desechable y los 4 correos de prueba. Confirma en
vivo, aislado del producto:

1. `approve` dispara el envío real (y con qué endpoint/payload exacto).
2. Apollo sustituye `{{email}}` en pixel/links (de esto depende todo el tracking propio).
3. `{{first_name}}` / `{{company_name}}` / `{{title}}` se rellenan.
4. Llegan opens/clics al pixel y enviado/respondió/rebotó al poll.

Correos de prueba: `sacostamolin@gmail.com`, `sebastian@onepay.la`,
`sacostamolina@outlook.com`, `sdacostam@eafit.edu.co` (Gmail, Workspace, Outlook,
universitario: mejor spread para ver el pixel en cada proveedor).

Salida: doc corto de hallazgos (qué tag funciona, qué no), estilo `experimento-apollo.md`.
La secuencia desechable se archiva al terminar (Apollo no tiene DELETE por API).

### Fase 2 — Cablear `approve` al producto

- Agregar `aprobarSecuencia(proveedorCampanaId)` al puerto `EnvioAdapter` y su
  implementación Apollo (endpoint/payload según lo confirmado en Fase 1).
- Exponerlo como acción explícita en la ficha de la campaña ("Aprobar y mandar"),
  separada de "Lanzar".
- Arreglar el comentario viejo de `apollo.ts:220`.
- Pruebas del adaptador y de la acción (una feature no está lista sin sus pruebas).

### Fase 3 — Test end-to-end por la UI real

Campaña de prueba: segmento de los 4 contactos de prueba, cadencia de 1-2 pasos de correo,
copy default. Flujo: lanzar -> aprobar -> el worker materializa y empuja -> verificar.

Verificación (observada en la DB y en las bandejas):
- Los 4 correos llegan con copy y merge-tags correctos.
- `evento_tracking` tiene `enviado` (poll).
- Al abrir un correo, aparece `abierto` (pixel).
- Al hacer clic en un link, redirige y aparece `clic`.

## Criterio de éxito

Un correo de prueba llega a la bandeja, con copy y merge-tags correctos, y en
`evento_tracking` aparecen `enviado`, `abierto` y `clic` para ese destinatario. Si algo
falta, el probe de Fase 1 ya dijo por qué antes de llegar a la UI.

## Fuera de este entregable (documentado, no construido)

### Personalización research-driven (fase siguiente)

Lo que Sebastián personaliza es el **cuerpo** (no el asunto), por empresa, a partir de
research manual y de forma opcional (a unas empresas no les encuentra nada). Ejemplos:
"trabajamos con X y con Y" (distinto por empresa), "veo que están usando todavía PCE".
Eso NO son merge-tags (no salen de una columna estructurada) y NO caben en el molde de
"un template por paso" de una secuencia de Apollo tal cual.

Mecanismo candidato (a confirmar contra la API antes de comprometerlo): un **custom field**
por contacto (ej. `{{personalizacion}}`) que el template referencia como merge-tag. El
template queda fijo; Sebastián llena ese campo empresa por empresa con su research antes
de aprobar la secuencia; vacío para las que no encontró nada. "Revisar antes de mandar"
se vuelve: llenar/aprobar cada bloque de personalización, y solo entonces `approve`.

Riesgo a validar: encaja si la personalización es un bloque en posición fija; si Sebastián
la teje en varios puntos del correo, un solo slot se queda corto. Alternativa si no aguanta:
sacar ese envío de la secuencia y mandarlo como correo individual.

Puente con el código existente: el eje "revisar antes de mandar" ya existe como
`paso_cadencia.es_manual` + `campana.modo='prioritaria'` + cola `/por-revisar` +
`aprobarPasoManual(idPasoInscripcion, ..., cuerpoFinal)`. Hoy ese camino NO manda por
Apollo (solo registra el `toque`, asume envío por fuera). Reconectar esa cola con el
envío real de Apollo es el corazón de esta fase siguiente.

### Tracking de WhatsApp

Requiere link acortado + correlator propio persistido (no hay `{{email}}` ni HTML donde
esconder el correlator como en correo). Build aparte, no reusa el diseño de correo. El
endpoint `/api/track/click` podría servir de destino con otro correlator.

## Decisiones tomadas

- Orden: tubería primero, personalización después.
- Personalización = cuerpo único por empresa, research-driven, opcional (no merge-tags).
- Buzón del test: Sebastián vincula el suyo primero.
- Correos destino: los 4 de arriba.
- Envío nunca automático: compuerta explícita "Aprobar y mandar".
