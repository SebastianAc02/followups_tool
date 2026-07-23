# MCP server del panel (solo lectura, login OAuth)

Expone las metricas del panel del CRO y la historia de deals por MCP, para consultarlas
desde Claude sin abrir la UI. Desde el 2026-07-23 la conexion es **login OAuth**: se pega la
URL en Claude y se entra con la cuenta de la tool (better-auth), sin copiar ningun token a
mano. Vive en `app/api/mcp/route.ts`, en el MISMO origen que el resto de la app
(`https://followupsonepay.duckdns.org`) -- ya no es un proceso aparte.

Las 3 tools (`app/mcp/tools.ts`) y el `McpServer` que las registra (`crearMcpServer` en
`app/mcp/server.ts`) se reusan tal cual del diseño original (Fase 3,
`docs/plan-panel-metricas-tiempo-real.md`): lo unico que cambio es el transporte y el auth.
Ver `docs/superpowers/specs/2026-07-23-mcp-oauth-login-design.md` para el diseño del login
OAuth.

El proceso standalone token-based (`app/mcp/index.ts`, `server.ts`, `auth.ts`,
`docker-compose.mcp.yml`) sigue en el repo pero queda REDUNDANTE: el trafico real pasa por
la route de Next. Se documenta abajo solo para desarrollo local rapido con curl/SDK
directo, no para el uso desde Claude.

Solo lectura: las tres tools llaman unicamente funciones de consulta del Repository
(`app/db/repository.ts`) y formulas puras del core. Ninguna escribe en la DB ni sincroniza
a Notion.

## Tools expuestas

### `panel_metricas`

Tiempo promedio en cada etapa, ciclo de venta promedio, conversion stage->stage y MRR
total estimado.

Input (todo opcional):

| campo | tipo | default |
|---|---|---|
| `idOrganizacion` | number | 1 (Onepay, unica organizacion real hoy) |
| `owner` | string | sin filtro. Filtra SOLO `conversionStage` -- las otras 3 cifras son vista del CRO sobre toda la organizacion, igual que en el panel |
| `ahora` | string `yyyy-mm-dd` | hoy |

Output: `{ organizacion, tiempoPromedioPorEtapa, cicloVentaPromedio, conversionStage, mrrEstimadoTotal }`.
`cicloVentaPromedio` es `null` cuando ningun deal ha llegado a `firma_pago` todavia (no se
inventa un 0).

### `deal_historia`

Historia de un deal: etapa actual, transiciones con fecha, plan asignado, MRR potencial,
%digital, probabilidad de cierre (heuristica por etapa) y usuarios efectivos.

Input: `{ idEmpresa: string, idOrganizacion?: number }` (default `idOrganizacion` = 1).

Output si la empresa existe:
`{ idEmpresa, nombre, etapaActual, transiciones: [{estado, fecha}], plan, mrrPotencial, digitalPct, probabilidadCierre, metodoProbabilidad, usuariosEfectivos }`.
`mrrPotencial` es `null` cuando el deal no tiene plan asignado (no se inventa una tarifa).

Output si no existe (o esta fuera del scope de `pipelineParaEndpoint`, ver el comentario en
`app/mcp/tools.ts`): `{ idEmpresa, error: 'empresa_no_encontrada' }`.

### `pipeline`

Lista de deals de la organizacion con sus cifras: mismo dato que expone
`GET /api/panel/pipeline`, mas el nombre del plan.

Input: `{ idOrganizacion?: number }` (default 1).

Output: `{ organizacion, empresas: [{ idEmpresa, nombre, etapa, dealSize, probabilidadCierre, metodoProbabilidad, digitalPct, plan, revenueEstimado }] }`.

## Auth (OAuth, plugin `mcp` de Better Auth)

`app/lib/auth.ts` habilita el plugin `mcp` de better-auth (`mcp({ loginPage: '/login',
oidcConfig: { requirePKCE: true, consentPage: '/mcp-consent' } })`): better-auth pasa a ser
el authorization server completo (discovery, dynamic client registration, authorize, token),
reusando `/login` como pantalla de login. No hay OAuth rodado a mano.

`app/api/mcp/route.ts` protege el endpoint con `withMcpAuth(auth, handler)`:

- Sin `Authorization` o con un bearer invalido -> `401` con header `WWW-Authenticate:
  Bearer resource_metadata="https://followupsonepay.duckdns.org/api/auth/.well-known/oauth-protected-resource"`.
  Un cliente MCP (Claude) sigue ese header solo: descubre el authorization server y abre el
  login en el navegador.
- Con un bearer valido pero sin acceso real: `403`. El gate de rol (`puedeQuerearMcp`,
  `app/lib/mcp-gate.ts`) exige `admin === true` **o** `verTodoPipeline === true` **o** ser
  owner real de Onepay (organizacion != "Visitantes", con un owner mapeado). Un Visitante
  logueado con exito NUNCA pasa este gate.

Discovery tambien publicado en la raiz del origen (`app/.well-known/oauth-authorization-server/route.ts`
y `app/.well-known/oauth-protected-resource/route.ts`), ademas de los que sirve el catch-all
de better-auth bajo `/api/auth/.well-known/*` -- por si el cliente prueba la convencion de
raiz antes de recibir el 401.

### PKCE y consentimiento obligatorios (review de seguridad 2026-07-23)

El registro de clientes (DCR) esta abierto por diseño del protocolo MCP -- Claude se
registra solo, no hay un `client_id` fijo para pre-aprobar. Eso solo, sin mas, es un hueco:
cualquiera puede registrar un cliente con su propio `redirect_uri`, armar un link a
`/api/auth/mcp/authorize` y mandarselo a alguien ya logueado (Sebastian/Camilo); sin una
barrera adicional el `code` sale directo hacia el `redirect_uri` del atacante. Dos capas lo
cierran:

- **`requirePKCE: true`**: sin esto, el default REAL del plugin (no lo que documenta el tipo
  `OIDCOptions` para el `oidcProvider` generico) es no exigir PKCE en `/mcp/authorize` ni en
  `/mcp/token`. Ya seteado, un intercambio de codigo sin `code_verifier` falla antes de
  siquiera mirar si el `code` es valido (`app/api/mcp/route.test.ts`).
- **Consentimiento SIEMPRE, no opcional**: `consentPage` por si solo NO alcanza -- el plugin
  solo redirige ahi cuando la request a `/mcp/authorize` trae `prompt=consent`, decision del
  CLIENTE que arma la URL (un atacante simplemente no lo manda). `app/lib/mcp-forzar-consentimiento.ts`
  agrega un plugin con un hook `before` que fuerza `prompt=consent` en TODA request a
  `/mcp/authorize`, sin excepcion -- asi la decision de mostrar consentimiento es del
  servidor. La pantalla real (`app/mcp-consent/page.tsx` + `app/mcp-consent/actions.ts`)
  muestra que cliente pide acceso y a que scope, con Aprobar/Rechazar; sin aprobacion
  explicita el plugin nunca emite `code` (rechazar redirige con `error=access_denied`).

DCR/redirect_uri en si NO se restringieron (evaluado y descartado por ahora): el unico
cliente real esperado es Claude, pero Claude tampoco trae un `client_id` fijo conocido de
antemano (se registra solo via DCR, como cualquier cliente MCP), asi que no hay una lista
blanca simple de `client_id`/`redirect_uri` que aplicar sin romper la conexion real. Acotar
por dominio de `redirect_uri` (ej. solo `claude.ai`/`claude.com`) es posible pero exige un
hook `before` propio sobre `/mcp/register` -- requirePKCE + consentimiento forzado ya cierran
el vector real (suplantacion silenciosa), asi que queda anotado, no construido.

## Levantar / desplegar

El MCP ya NO necesita un contenedor aparte: vive dentro de `followups-web` (la misma imagen,
el mismo `next start`). El unico paso de deploy es la migracion de las 3 tablas nuevas que
el plugin `mcp` necesita (`oauth_application`, `oauth_access_token`, `oauth_consent`):

```bash
# Una sola vez, contra isps.db (local o del VPS, vía ISPS_DB_PATH)
python3 scripts/migrate_mcp_oauth_apply.py
```

Es idempotente (`CREATE TABLE IF NOT EXISTS`), mismo criterio que `migrate_auth_apply.py`
(V2.1). El contenedor `mcp` standalone (`docker-compose.mcp.yml`) puede apagarse sin perder
funcionalidad -- es un paso de deploy del orquestador, no de este cambio de codigo:

```bash
docker compose -f docker-compose.production.yml -f docker-compose.mcp.yml stop mcp
```

`Caddyfile`: `mcp.followupsonepay.duckdns.org` ya no proxea a `mcp:3900`, proxea a
`followups-web:3000` (mismo contenedor que el dominio principal). El subdominio que Camilo
ya tenia guardado sigue vivo; tambien se puede usar `https://followupsonepay.duckdns.org/api/mcp`
directo.

## Conectar desde Claude

Se pega la URL del MCP en la config de conectores de Claude (claude.ai/settings/connectors,
o `mcpServers` en Claude Desktop/Code) -- SIN headers ni token, el login pasa por OAuth:

```json
{
  "mcpServers": {
    "followups-panel": {
      "url": "https://followupsonepay.duckdns.org/api/mcp"
    }
  }
}
```

(el subdominio `https://mcp.followupsonepay.duckdns.org/api/mcp` sirve exactamente lo
mismo). Al conectar, Claude detecta el `401` + `WWW-Authenticate`, resuelve el discovery
OAuth, abre `/login` en el navegador y, tras loguearse con la cuenta de la tool, SIEMPRE
muestra la pantalla "Autorizar acceso" (`/mcp-consent`, ver arriba) antes de volver a Claude
con el token -- no hay ningun secreto que copiar ni pegar, pero si un paso explicito de
Aprobar.

## Desarrollo local / debug directo con el SDK (proceso standalone, token manual)

El proceso aparte (`app/mcp/index.ts` + `server.ts`, token bearer manual) sigue disponible
para pruebas rapidas sin pasar por el navegador:

```bash
MCP_TOKEN=lo-que-sea npm run mcp
```

Arranca en `http://localhost:3900` contra la misma `isps.db` que usa `npm run dev`
(mismo `ISPS_DB_PATH`/default que el resto de la app, ver `app/db/index.ts`). Con el SDK de
`@modelcontextprotocol/sdk` directo (Node), el mismo patron que usa `app/mcp/server.test.ts`:

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const client = new Client({ name: 'mi-cliente', version: '1.0.0' });
const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3900/mcp'), {
  requestInit: { headers: { Authorization: 'Bearer lo-que-sea' } },
});
await client.connect(transport);
const { tools } = await client.listTools();
const resultado = await client.callTool({ name: 'panel_metricas', arguments: {} });
```
