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

## Dónde corre el MCP, y contra qué base

Descubierto el 2026-07-25 a costa de 5 llamadas y una conclusión errada. Si esto no está claro,
se vuelve a perder el tiempo igual.

- **El MCP no es un contenedor.** Es una route de `followups-web` (`app/api/mcp`), protegida por
  el plugin `mcp` de Better Auth, servida en `mcp.followupsonepay.duckdns.org` y conectada como
  conector de claude.ai. Se despliega con el web, no necesita nada extra.
- `docker-compose.mcp.yml` quedó **deprecado** el 2026-07-23 (ver `Caddyfile:13`). No agregarlo al
  `up -d` del deploy: revive un servicio muerto. En el VPS no existe ningún contenedor `followups_mcp`.
- **El MCP lee la base de PRODUCCIÓN** (volumen `followups_data` del VPS), no la isps.db local. Los
  conteos difieren de verdad: el 2026-07-24 la local decía 141 on_hold y 102 firma_pago mientras el
  MCP devolvía 125 y 87. Para estado y existencia se le pregunta al MCP, nunca a la local.
- `followups-tool/isps.db` es un archivo de 0 bytes. La base real vive un nivel arriba (`../isps.db`),
  y aun así es la local, no la de prod.
- `deal_historia` responde `empresa_no_encontrada` en DOS casos distintos: la empresa no existe, o
  existe pero sin `estado_notion`. No los distingue. Para saber cuál de los dos es, usar
  `buscar_empresa`, que cruza nombre, alias, prospección (website, teléfono) y contactos.

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

## Toda corrección manual repetible se vuelve una tool del MCP

Regla de Sebastián, 2026-07-25. Cuando aparezca un arreglo que tocaría hacer a mano (por SSH,
por SQL suelto, o pidiéndole a alguien que lo haga en Notion), la primera pregunta es si el MCP
puede manejarlo. Si puede, se construye la tool y se usa; no se hace el arreglo manual "solo esta
vez".

El criterio no es que el caso sea frecuente, es que sea **repetible**: si el proceso se puede
describir en pasos, va al MCP. Un arreglo manual no deja rastro, no tiene pruebas, no se puede
delegar y hay que volver a explicarlo la próxima vez. Una tool sí.

Caso que originó la regla: crear una cuenta antes de conseguir su NIT deja el id sintético
(`ntn-`/`999`), y ninguna tool reasignaba el id. Corregirlo a mano habría sido tocar una PK por
SSH. Se construyó `reasignar_nit` en su lugar.

## Playbooks

Cada proceso que ya costó tiempo una vez tiene su procedimiento escrito. Si aparece un caso que
no está y se resuelve a mano, se agrega al documento que corresponda.

| Documento | Cuándo abrirlo |
|---|---|
| `docs/playbooks-notion.md` | Página nueva en Notion, cambio de estado u owner, página borrada, toque de una empresa que no está en Notion, subir a Notion lo que nació aquí |
| `docs/playbook-deploy-mcp.md` | Cambiaste algo del MCP y hay que desplegarlo y verificar que el cliente lo ve |
| `docs/playbook-migraciones.md` | Vas a tocar el esquema de la base |
| `docs/playbook-diagnostico.md` | Vas a investigar un descuadre o cualquier cosa que implique traer datos |
| `docs/playbook-cartera-owner.md` | Auditar lo que tiene una persona contra lo que ve en Notion |
| `docs/playbook-subagentes.md` | Vas a delegar trabajo en paralelo |
| `docs/base-de-produccion.md` | Cualquier duda sobre la base: cuál es cuál, cómo se cruza, qué campo es qué |
| `docs/reconciliacion-notion.md` | Cuadrar el pipeline completo contra Notion |

Se confirma siempre con Sebastián antes de escribir, pero llegando con la propuesta hecha: la
página ya leída, `buscar_empresa` ya corrido, y una acción concreta con su evidencia. La pregunta
tiene que costarle una palabra. Preguntar algo que se responde mirando la página o corriendo una
tool no es una pregunta, es trabajo sin hacer.

## Cómo se trabaja

- Una tarea de `planning/tasks.md` por delegación. Diff pequeño y revisable.
- No agregar dependencias nuevas sin justificar. No tocar archivos no relacionados.
- Una feature no está lista sin sus pruebas. La IA tiene su propio eval (`planning/evals.md`).
- Voz de textos para humanos: sin emojis, sin em dashes, español directo. Owner = Sebastián siempre.
- Modo learning activo (plugins `learning-output-style` + `explanatory-output-style`, criterio de
  John Oct, johnoct.com/blog/2025/08/22/claude-code-output-styles-learning-mode-insights): al tocar
  core/dominio o decidir entre alternativas de arquitectura válidas, la IA explica el porqué
  (trade-offs, no solo el qué) antes de escribir, con bloques `★ Insight`, y deja un bloque de
  5-10 líneas para que Sebastián lo escriba (la decisión de diseño, no el boilerplate alrededor).
  La fricción es a propósito: ir más lento pensando activamente enseña más que aceptar código ya
  generado, así que la IA no se salta el hueco ni lo rellena por su cuenta para ir más rápido.
  Cada tarea cierra con un checkpoint: Sebastián explica de vuelta el concepto antes de seguir a
  la próxima. No aplica a migraciones, UI o tareas mecánicas sin decisión real (ahí sí puede ir
  directo). Los insights viven en la conversación, nunca como comentario en el código.
