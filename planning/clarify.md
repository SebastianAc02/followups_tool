# Clarify — decisiones tomadas

Cada decisión con su razón y su tradeoff. Si vive solo en el chat, no existe.

## D1 — Stack: Next.js + Drizzle sobre isps.db (2026-06-29, ajustado 2026-06-30)
Next por front+servidor en un proyecto (corre el worker de Granola, el cron, guarda llaves).
Drizzle por portabilidad SQLite -> Turso. App 100% web.

## D2 — La base ya está seedeada (2026-06-30, reemplaza el "seed perezoso" anterior)
Se hizo el seed completo de Notion -> isps.db (no perezoso): 395 enlaces, 100 empresas nuevas,
142 alias, 181 toques. isps.db es la fuente de la verdad. El cockpit se para encima de esta base.

## D3 — Matching de empresas en dos pasos + humano (2026-06-30)
(1) exacto por nombre normalizado + `empresa_alias`; (2) token distintivo + dominio + teléfono para
los que el string no ve. IA juez en dudosos; humano resuelve inciertos; cada decisión se guarda como
alias y el sistema aprende. UUID de Metabase = llave fuerte para clientes. Ver [[feedback-duplicates]].

## D4 — La IA no sube a Notion sin revisión (2026-06-29)
Los campos que la IA saca del resumen quedan en borrador; Sebastián los revisa (en lote, fin de jornada)
antes de que entren a la cola de sync. Razón: Notion es el CRM real; un error propagado rompe confianza.

## D5 — Sync de una sola vía con Outbox (2026-06-29)
DB -> Notion, nadie edita Notion a mano. Idempotente con llave propia. Notion es temporal: migrar a un
CRM real mañana = cambiar el adaptador, no rescatar de Notion.

## D6 — Granola es el grabador, la herramienta no graba (2026-06-30)
Llamada y reunión se hacen en Granola. La herramienta pesca el resumen vía worker y arma el toque solo.
Felipe no hace doble grabación. Guardar audio crudo a Drive para re-escucharse = opcional, fase 2.

## D7 — Categorías (2026-06-30)
`empresa.categoria` = isp / utility / otro. ISP por defecto; baja a utility/otro solo si un flag de
descarte lo marca. Utilities (Claro, Tigo, energía, agua, gas) entran solo con lo básico. Excluidos:
Insumos y desechables, ClonAI, Anta, Latitude-SH, Delta ISP CRM.

## D8 — Logs en vez de backup (2026-06-30)
El historial de cambios vive en la tabla `sync_cambios` (auditoría). Merge no destructivo (rellena
vacíos, nunca pisa dato bueno ni borra). Backup rotativo único `isps.db.bak` solo como red de seguridad.

## D9 — Transcripts: puntero, no copia (2026-06-30)
Guardar puntero (proveedor + id + url + dueño de la credencial) + resumen cacheado, no el transcript
crudo. Provider agnóstico (granola/tldv/...). El CRO sigue leyendo Notion por ahora.
