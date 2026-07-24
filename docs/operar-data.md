# Operar data en followups-tool

Manual operativo de cómo mover data real en la tool: editar, crear, mover registros, en LOCAL
y en PRODUCCIÓN. Grounded en el código al 2026-07-24 (rutas y líneas citadas). Cuando no hay
camino limpio, se dice explícito: no se inventa uno.

Hecho central que atraviesa las cinco recetas: casi todo pasa por una Server Action de
Next.js (`"use server"`), gateada por sesión humana (`requireSession`/`requireEscritura`,
`app/lib/session.ts`), nunca por API REST ni CLI. No hay `curl` que registre un toque.

## Receta 1 — Registrar un toque (contestada, no contestada, correo/whatsapp suelto)

Todo toque, sin excepción, pasa por `registrarToque()` (`app/db/repository.ts:590`). Escribe
`toque` (insert) y `empresa` (update), en una transacción.

Columnas que toca en `toque`: `id_empresa`, `id_contacto` (si viene KDM), `fecha`, `canal`,
`resultado`, `que_paso`, `proximo_follow_up_fecha`, `razon_perdida`, `objecion`, `fuente='cockpit'`,
`id_organizacion`. En `empresa`: `updated_at` siempre; `proximo_follow_up_fecha`,
`proximo_canal`, `crm_software`, `pasarela_actual` solo si vinieron en el input.

Validación Zod (`registrarToqueSchema`, `app/db/validation.ts:260`): `canal` uno de
`llamada | whatsapp | correo`; `resultado` uno de `contesto_reunion | contesto_sigue_seguimiento
| contesto_no | no_contesto | no_llego`; `razonPerdida` **obligatoria** si `resultado='contesto_no'`
(el `.superRefine` lanza si falta).

No existe un concepto de "dual call" en el schema ni en el código: no hay tabla, columna ni
enum que lo distinga. Dos llamadas en la misma sesión son dos llamadas a `registrarToque()`
independientes (dos filas en `toque`).

Callers reales (todos Server Actions, todos gateados por `requireSession`):
- `registrarToqueAction` (`app/llamada/[id]/actions.ts:39`) — el formulario completo de
  CapturaLlamada, las 4 salidas de guion.
- `registrarToqueSueltoAction` (`app/llamada/[id]/actions.ts:369`) — correo/whatsapp sin
  cadencia activa, fuerza `resultado='no_contesto'` (más honesto disponible: nadie ha
  contestado todavía).
- `registrarTapAction` (`app/actions.ts:24`) — tap rápido desde `/cola`, mismo
  `resultado='no_contesto'`, `proximoFollowUp` = mañana.
- `cerrarPBXAction` (`app/llamada/[id]/actions.ts:309`) — cierre del bucle PBX,
  `resultado='no_contesto'` también (no es una de las 4 salidas de llamada real).

Detalle que rompe la intuición: `registrarToque` NO escribe `empresa.proximo_paso` en local
(el `sets` de la actualización solo toca `proximoFollowUpFecha`/`proximoCanal`/`crm`/`pasarela`).
Lo que se manda a Notion como "Próximo Paso" es `parsed.quePaso` (el relato del toque), no un
campo separado de "próximo paso" real. La columna `empresa.proximo_paso` local solo la
escriben `enriquecerDesdeNotion` (Notion→DB) y `guardarProximoPasoPBX` (bucle PBX).

Efecto colateral automático: si la empresa venía de `estado_notion='on_hold'`, cualquier
resultado la gradúa a `contacto_iniciado`; si venía de `on_hold` o `contacto_iniciado` y el
resultado es `contesto_reunion`, salta a `reunion_agendada` (`estadoDestinoPorToque`,
`app/core/transicion-estado.ts:35`). Es la ÚNICA forma en que un toque mueve el embudo, y
NO se sincroniza a Notion (ver Receta 5).

Local y prod: mismo código, misma función. Local corre contra
`/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db`; en prod corre dentro del
contenedor `followups_web` contra `/data/isps.db` (volumen `followups_data`). La diferencia
la pone la sesión desde la que entrás a la URL (local: `localhost:3000`; prod:
`https://followupsonepay.duckdns.org`), no el código.

## Receta 2 — Mover una empresa de estado en el embudo (estado_notion)

Hoy NO hay un camino limpio para mover a mano una empresa a una etapa arbitraria
(`oportunidad`, `cierre_documentacion`, `enviar_contrato`, `firma_pago`, `on_hold`) desde la
tool. Se dice así de crudo porque es la realidad del código, no una limitación de diseño
pendiente de descubrir.

Lo que sí existe:

1. **Las dos transiciones automáticas de un toque** (Receta 1): `on_hold → contacto_iniciado`
   y `(on_hold|contacto_iniciado) → reunion_agendada`. Es una lista blanca cerrada
   (`app/core/transicion-estado.ts`), a propósito "solo avanza, nunca retrocede". Cualquier
   otro estado de origen, un toque no le hace nada.

2. **El único escritor auditado de `estado_notion` es `actualizarEstadoNotion()`**
   (`app/db/repository.ts:5303`): actualiza `empresa.estado_notion` + inserta en
   `empresa_estado_historial` en la misma transacción. Pero su ÚNICO caller real es
   `scripts/sync_estados_notion.ts` (T10), y ese script trae el estado **desde** un export
   CSV de Notion (`/Users/sebastianacostamolina/Arc/Private & Shared 7/🔥 Sales Pipeline...csv`),
   descargado a mano, corrido a mano en el Mac de Sebastián. Dirección Notion → DB,
   nunca DB → Notion.

3. **El pipeline comercial "se maneja a mano en Notion"** (cita literal del comentario en
   `scripts/sync_notion_estado.py`): mover una empresa de etapa es un clic en Notion, y ese
   cambio solo llega a `isps.db` cuando alguien corre el script de sync. No hay webhook, no
   hay polling, no hay API call en tiempo real.

Por qué no hay camino DB → Notion para el estado: `CambioNotion`
(`app/core/ports/sync.ts`) es el contrato completo de lo que el outbox puede empujar a
Notion, y NO tiene un campo de estado. El comentario en el propio archivo lo explica:
"Estado es tipo 'status' (no texto ni select simple), fuera de alcance de este primer corte,
requiere mapear contra los grupos de status reales de Notion antes de escribirlo con
seguridad." `app/adapters/notion.ts` (`construirPropiedades`) confirma: no arma la
propiedad "Estado" en ningún PATCH.

Consecuencia práctica: si un toque gradúa localmente `on_hold → contacto_iniciado`, ese
cambio queda visible en la tool (y en `empresa_estado_historial`) pero Notion se queda
mostrando la etapa vieja hasta que alguien la mueva ahí también a mano.

## Receta 3 — Cambiar la cadencia de una empresa y reprogramar el follow-up

**Reprogramar la fecha/canal de follow-up SÍ tiene camino limpio**: es parte de Receta 1.
`proximoFollowUp` y `proximoCanal` en el formulario de `registrarToqueAction` (o los
parámetros de `registrarToqueSueltoAction`/`registrarTapAction`) escriben
`empresa.proximo_follow_up_fecha` y `empresa.proximo_canal`, y `fechaProximoPaso` sale por el
outbox hacia la propiedad "Fecha Próximo Paso" de Notion en el mismo toque.

**Cambiar la cadencia de una empresa YA inscrita NO tiene camino limpio hoy.**
`inscribirEmpresaEnCadencia(idEmpresa, idCampana)` (`app/db/repository.ts:2631`) es la
función que en teoría inscribe una sola empresa en la cadencia de una campaña puntual, pero
**no tiene ningún caller en código de aplicación** — el único sitio que la llama es su propio
test (`app/db/repository.inscribirEmpresaEnCadencia.test.ts`). Es una función viva pero sin
cablear a ninguna Server Action ni botón de la UI.

Lo que SÍ está cableado:
- **Sacar una empresa de su cadencia actual**: `sacarDeCadenciaAction`
  (`app/llamada/[id]/actions.ts:402`) → `sacarInscripcionDeCampana(idInscripcion, 'llamada')`
  (`app/db/repository.ts:4766`). Corta local primero e incondicional; si la campaña tiene
  secuencia en Apollo, intenta sacarla allá también, pero un fallo de Apollo no revierte el
  corte local.
- **Inscribir en bloque**: `inscribirCampana(idCampana, idOrganizacion)`
  (`app/db/repository.ts:2425`), llamado desde `app/campanas/[id]/lanzar/actions.ts:96` al
  lanzar una campaña completa sobre todo su segmento. No sirve para mover UNA empresa sin
  mover el segmento entero.

Receta real hoy para "ponla en otra cadencia": sacar a la empresa de la campaña actual
(`sacarDeCadenciaAction`, tiene botón en la UI de llamada) y, si la cadencia destino ya tiene
una campaña activa cuyo segmento la cubre, esperar a que el motor la recoja, o correr
`inscribirEmpresaEnCadencia` a mano por script (`node --experimental-strip-types
--experimental-loader ./scripts/resolve-ts-ext.mjs`, importando la función). No hay UI para
esto último.

## Receta 4 — Marcar razón de pérdida / on hold

**Razón de pérdida SÍ tiene camino limpio, pero solo queda local.** Se captura como parte de
un toque (Receta 1): `resultado='contesto_no'` exige `razonPerdida` (Zod lo rechaza si falta).
Queda en `toque.razon_perdida`. **No se sincroniza a Notion**: `razonPerdida` no existe en el
tipo `CambioNotion` ni en `construirPropiedades`, así que por diseño nunca sale de `isps.db`.
Si Notion necesita saber la razón, hay que escribirla ahí a mano.

**Marcar una empresa como `on_hold` (el "parqueado/perdido" del embudo,
ver comentario en `app/db/funnel.ts:47`) NO tiene camino limpio desde la tool.** `on_hold` es
un valor de `estado_notion`, y como se explicó en la Receta 2, el único escritor auditado de
esa columna (`actualizarEstadoNotion`) solo lo alimenta el sync que lee desde Notion. Poner a
una empresa en `on_hold` hoy es: marcarla "On Hold" en Notion a mano, y correr
`scripts/sync_estados_notion.ts` para que baje a `isps.db`.

## Receta 5 — Qué llega a Notion (outbox) y qué NO si te saltás la Server Action

El patrón outbox es real y funciona, pero su alcance es más angosto de lo que sugiere el
nombre "sync". Hay un solo punto de encolado en todo el repo: `encolarOutboxNotion()`
(`app/db/repository.ts:122`), llamado UNA vez, dentro de `registrarToque`
(`app/db/repository.ts:706`).

Lo que SÍ viaja a Notion en cada toque (tabla `outbox` → `followups-worker` →
`crearNotionAdapter()`, cada 5 minutos, `app/worker/index.ts`):
- `proximoPaso` (= el `quePaso` del toque, no un campo de "próximo paso" separado)
- `fechaProximoPaso` (= `proximoFollowUp`)
- `fechaUltimoContacto` (fecha del toque, siempre)
- `fechaPrimerContacto` (solo la primera vez que la empresa recibe un toque)
- `toquesHechos` (tabla de texto plano con el historial completo)

Lo que el TIPO `CambioNotion` soporta pero que HOY nunca se manda (porque nada más llama a
`encolarOutboxNotion`): `notasDiscovery`. `guardarDiscovery()` (`app/db/repository.ts:810`,
usada por `registrarToqueAction` para persistir el borrador de discovery aprobado) actualiza
`empresa.notas_discovery` y `empresa.brief` en local, pero el comentario en el propio código
lo admite ("NO encola al outbox: eso lo hace el caller") y ningún caller lo hace hoy. Notas
Discovery y Brief quedan en `isps.db`, nunca llegan a Notion por este camino.

Lo que NUNCA está en el contrato (ni siquiera como campo sin usar): `estado_notion` (Receta
2), `razonPerdida`/`objecion` (Receta 4), `owner`, `crm_software`, `pasarela_actual`. Si
necesitás que Notion refleje cualquiera de esos, hoy la única vía es escribirlo ahí a mano.

Si escribís SQLite directo (local o vía `docker exec` en prod) saltándote la Server Action:
- El toque/cambio SÍ queda en `isps.db`.
- NUNCA se encola en `outbox` (ese insert vive solo dentro de la transacción de
  `registrarToque`), así que aunque el campo esté soportado por Notion, no sale.
- No dispara las transiciones de estado de `estadoDestinoPorToque` (viven en TypeScript, no
  en la DB).
- No pasa por `registrarToqueSchema`: nada te impide dejar un `contesto_no` sin
  `razonPerdida`, o un canal que no existe.

## Local vs producción: la verdad cruda

Local (`/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db`, un nivel arriba del
repo, ruta default en `app/db/index.ts:12` y en `drizzle.config.ts:10`, overrideable con
`ISPS_DB_PATH`) y prod (`/data/isps.db` dentro del volumen Docker `followups_data`, montado
en los contenedores `followups_web` y `followups_worker` del VPS Hetzner
`62.238.55.238` / Tailscale `100.71.80.117`) **son dos archivos completamente separados, sin
sync automático en ninguna dirección.**

El "cutover" documentado (`planning/plan-deploy-vps.md`) fue un `scp` manual de la DB local al
volumen del VPS. Ojo con un detalle real de incidente (`planning/plan-conectores-reparacion.md`,
2026-07-15): hubo al menos un re-sync manual POSTERIOR al cutover inicial ("Parte D del plan
de fechas") que trajo tablas de negocio (`conector`, `conector_config`, `linea_whatsapp`) desde
local y pisó cambios que ya existían en prod, revirtiendo una verificación de Gmail que
Sebastián ya había hecho ahí. No es que "nunca se ha vuelto a tocar prod desde el Mac": sí se
ha hecho, es manual, y la última vez que se hizo rompió algo. Tratar cualquier resync
local→prod como una operación de riesgo real, no como un `cp` inocuo (además SQLite en modo
WAL: un `cp` de archivo NO alcanza, hay que usar `VACUUM INTO` para un backup consistente).

Escribir directo a SQLite LOCAL (tu Mac) hoy:
- No llega a prod (son archivos distintos).
- No llega a Notion (el outbox y el worker de prod son los que drenan; local no corre el
  worker contra el mismo volumen que ve el mundo real).
- Sirve para pruebas, seeds, scripts de un solo uso contra tu propia copia.

Escribir vía la Server Action (`registrarToqueAction`, etc.) en LOCAL:
- Si tu `.env.local` apunta a `ISPS_DB_PATH` real (no `pruebas.db`), sí modifica la misma DB
  que lee la app en tu Mac. Sigue sin ser prod: el volumen del VPS no lo ve.
- El outbox se encola en `isps.db` local; solo lo drena un worker que corra contra ESE mismo
  archivo (normalmente no corrés `npm run worker` en local apuntando a la DB real).

Opciones reales para mover data en PRODUCCIÓN hoy, en orden de preferencia:

1. **La UI web logueado**, en `https://followupsonepay.duckdns.org`. Es el único camino que
   pasa por Zod, por las reglas de dominio (`registrarToqueSchema`, `estadoDestinoPorToque`) y
   por el outbox. Preferí esto siempre que la operación tenga UI.

2. **SSH al VPS + `docker exec` con un script Node ad hoc**, cuando la operación no tiene UI
   (fue el camino real usado en el incidente de conectores, `planning/plan-conectores-reparacion.md`).
   Patrón confirmado contra el repo, con backup + transacción + bitácora en `sync_cambios`:

```bash
# 1. Backup consistente ANTES de escribir (cp NO sirve en WAL, hay que usar VACUUM INTO)
ssh deploy@62.238.55.238 "docker exec -w /app followups_web node -e \"
const D=require('better-sqlite3');const db=new D('/data/isps.db');
db.exec(\\\"VACUUM INTO '/data/backup-manual-$(date +%Y%m%d).db'\\\");db.close();console.log('backup ok');
\""

# 2. El cambio real, en transacción, con su porqué en sync_cambios (nunca un UPDATE suelto)
cat > /tmp/cambio.js <<'EOF'
const D = require('better-sqlite3');
const db = new D('/data/isps.db');
const tx = db.transaction(() => {
  db.prepare("UPDATE <tabla> SET <col> = ? WHERE <condicion>").run(/* valores */);
  db.prepare(
    `INSERT INTO sync_cambios (corrida,fuente,entidad,id_registro,accion,detalle)
     VALUES ('manual-<fecha>','manual','<entidad>',?,'update','<por que se hizo>')`,
  ).run('<id_registro>');
});
tx();
db.close();
EOF
scp /tmp/cambio.js deploy@62.238.55.238:/tmp/cambio.js
ssh deploy@62.238.55.238 "docker cp /tmp/cambio.js followups_web:/app/cambio.js && docker exec -w /app followups_web node cambio.js"
```

3. **Nunca**: escribir `conector.credencial_ciphertext` por SQL a mano (rompe el cifrado
   AES-256-GCM, ya documentado como error real en `planning/plan-conectores-reparacion.md`).
   Esa columna solo se toca por la UI (`/conectores` → guardar → `cifrar()`).

## MCP: quién puede leer hoy (y quién no puede escribir)

Confirmado contra el código: hay DOS implementaciones del MCP server, no una.

- **La legacy standalone** (`app/mcp/index.ts`, `server.ts`, `auth.ts`,
  `docker-compose.mcp.yml`): proceso Node aparte, puerto 3900, bind SOLO a
  `100.71.80.117` (Tailscale del VPS), auth por `MCP_TOKEN`. Sigue en el repo pero
  `docs/mcp-panel-server.md` la marca **REDUNDANTE desde el 2026-07-23**: "el tráfico real
  pasa por la route de Next", se documenta solo para pruebas locales con curl/SDK directo.

- **La real, en producción hoy**: `app/api/mcp/route.ts`, mismo origen que la web
  (`https://followupsonepay.duckdns.org/api/mcp`), protegida por el plugin `mcp` de
  better-auth (login OAuth con PKCE obligatorio + pantalla de consentimiento
  `/mcp-consent`), más un gate de rol (`puedeQuerearMcp`, `app/lib/mcp-gate.ts`: admin, o
  `verTodoPipeline`, o ser owner real de Onepay). Un Visitante logueado no pasa el gate.

Las dos exponen exactamente las mismas 3 tools (`app/mcp/tools.ts`): `panel_metricas`,
`deal_historia`, `pipeline`. Confirmado leyendo el archivo: **solo lectura, punto** — cada
función solo llama a funciones de consulta del Repository (`duracionPromedioPorEtapa`,
`cicloVentaPromedio`, `pipelineParaEndpoint`, `historialEtapasEmpresa`...) y fórmulas puras
del core. Ninguna escribe, ninguna llama a `registrarToque` ni a ningún adaptador.

## Camino limpio pendiente (propuesta, no una decisión tomada)

Hoy no existe ningún punto de entrada externo de ESCRITURA a la tool: todo pasa por sesión de
navegador. Para un agente (Claude, u otro) que quiera registrar un toque real sin que un
humano abra el navegador, el punto de entrada más limpio sería exponer `registrarToque()`
como una tool de ESCRITURA en el mismo MCP server que ya existe (`app/mcp/tools.ts` +
`app/api/mcp/route.ts`), reusando el mismo gate de auth OAuth y agregando una validación de
rol específica para escritura (el gate actual, `puedeQuerearMcp`, es de lectura). Esto es una
propuesta para que el dueño del repo la evalúe, no un cambio ejecutado ni decidido.

Dario queda fuera de este análisis: su arquitectura no se toca ni se propone tocar aquí.

## Relacionado

- `../CLAUDE.md`
- `../planning/plan-deploy-vps.md`
