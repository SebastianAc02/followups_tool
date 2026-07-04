# Herramienta de follow-ups OnePay — Constitución

Reglas durables del proyecto. La IA las carga en cada sesión. Si una regla no cambia
el comportamiento de la IA en este repo, se borra.

## Qué es

Cockpit web para ejecutar follow-ups comerciales (ISPs) rápido: cola del día, ficha de la cuenta,
próximo follow-up manual, conteo automático por tipo y canal. La captura (llamada y reunión) pasa
por Granola; la herramienta pesca el resumen y arma el toque. La IA procesa en background; Notion
se actualiza con revisión humana, nunca a mano.

## Stack

- Next.js (React + servidor en un solo proyecto) + TypeScript. App 100% web; NO graba (no micrófono).
- Drizzle ORM sobre isps.db (SQLite local). Fase 2: Turso (misma sintaxis).
- Granola (API/MCP) para transcripts. Notion (API) para sync de salida. Claude (API) para procesar.

## La base ya existe

isps.db es la fuente de la verdad, seedeada desde Notion (2026-06-30). NO recrear tablas: reflejar
las que hay. Tablas relevantes: `empresa` (con `categoria` isp/utility/otro), `contacto` (multipersona),
`toque` (id_empresa, id_contacto, canal, que_paso, proximo_follow_up_fecha, transcript_proveedor/id/url),
`empresa_alias` (dedup, el matcher escribe aquí), `sync_cambios` (log de auditoría).

## Arquitectura (no negociable)

- El **core** (dominio: empresa, contacto, toque) NO importa Granola, Notion, Claude ni el driver de DB.
  Los toca solo por interfaces (puertos).
- Cada dependencia externa es un **adaptador**: `Repository` (DB), `GranolaAdapter`, `NotionAdapter`,
  `ClaudeAdapter`. Cada canal (whatsapp/correo) y proveedor de transcript es un adaptador.
- Acceso a datos solo por el Repository. Nunca SQL crudo regado por el código.
- `canal` y `transcript_proveedor` son DATOS, no código (correo/WhatsApp y TLDv/otro entran sin reescribir).

## Captura y sync

- Captura: Granola es el grabador. Un worker enlaza cada sesión a la empresa con el matcher (`empresa_alias`),
  trae el RESUMEN (no el transcript literal), arma el toque + puntero + resumen cacheado. La key vive
  server-side; el consumidor (CRO/MCP) lee el cacheado sin credencial.
- Sync a Notion: una sola vía DB -> Notion, nadie edita Notion a mano. Patrón Outbox (escribe la fila a
  sincronizar en la misma transacción), idempotente, backoff, log de fallidos en `sync_cambios`.
- La IA NO sincroniza sus campos sin revisión humana previa (borrador -> aprobar -> outbox).

## Fuera de v1 (no construir)

Frío puro, cadencia automática, sugerir números alternos, multipersona en la UI, scoring, colas pesadas
(Redis), sync de dos vías, cosecha de WhatsApp, archivar audio a Drive. El modelo deja la puerta abierta.

## Cómo se trabaja

- Una tarea de `planning/tasks.md` por delegación. Diff pequeño y revisable.
- No agregar dependencias nuevas sin justificar. No tocar archivos no relacionados.
- Una feature no está lista sin sus pruebas. La IA tiene su propio eval (`planning/evals.md`).
- Voz de textos para humanos: sin emojis, sin em dashes, español directo. Owner = Sebastián siempre.
