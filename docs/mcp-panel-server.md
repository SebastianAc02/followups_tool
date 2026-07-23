# MCP server del panel (Fase 3, solo lectura)

Expone las metricas del panel del CRO y la historia de deals por HTTP, para consultarlas
desde Claude (o cualquier cliente MCP) sin abrir la UI. Vive en `app/mcp/` (server aparte,
no una route de Next), se despliega junto a followups-tool en el VPS con
`docker-compose.mcp.yml`. Ver `docs/plan-panel-metricas-tiempo-real.md` (Fase 3) para el
diseño completo.

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

## Auth

Token obligatorio, sin excepcion. El server NO arranca si falta `MCP_TOKEN` en el entorno
(ver `app/mcp/index.ts`) y rechaza con `401` cualquier request a `POST /mcp` que no lo
traiga o lo traiga mal.

Dos formas de mandarlo (cualquiera de las dos sirve):

```
Authorization: Bearer <MCP_TOKEN>
```
o
```
X-MCP-Token: <MCP_TOKEN>
```

`GET /health` no exige token (sin dato de negocio, solo confirma que el proceso esta
vivo -- lo usa el healthcheck de Compose).

## Levantar en el VPS

El servicio `mcp` se agrega al stack existente con doble `-f`, sin tocar
`followups-web`/`followups-worker`/`caddy` (mismo patron que blast):

```bash
# En ~/followups-tool del VPS, junto al resto del stack
docker compose -f docker-compose.production.yml -f docker-compose.mcp.yml up -d mcp
```

Variables de entorno (en `.env.production`, no en el compose versionado):

| variable | obligatoria | descripcion |
|---|---|---|
| `MCP_TOKEN` | si | secreto del bearer token. El server no arranca sin ella |
| `MCP_PORT` | no (default 3900) | puerto donde escucha el server dentro del contenedor |

El puerto se publica directo al host (`3900:3900`, ver el comentario en
`docker-compose.mcp.yml`): no esta detras de Caddy porque la decision del owner fue que
cualquiera se conecte por red sin instalar nada, sin necesitar TLS/dominio publico.
Alcanzable dentro de la red del VPS o por Tailscale, igual que dario
(`reference_dario_deployment_topology`).

Bajar solo este servicio sin afectar el resto del stack:

```bash
docker compose -f docker-compose.production.yml -f docker-compose.mcp.yml stop mcp
```

## Conectar un cliente MCP por HTTP

Cualquier cliente que hable Streamable HTTP (el transporte estandar del SDK de MCP) se
conecta apuntando a `http://<host>:3900/mcp` con el header de auth. Ejemplo de config para
un cliente tipo Claude Desktop/Claude Code (`mcpServers` en su config JSON):

```json
{
  "mcpServers": {
    "followups-panel": {
      "url": "http://<host-vps-o-tailscale>:3900/mcp",
      "headers": {
        "Authorization": "Bearer <MCP_TOKEN>"
      }
    }
  }
}
```

Con el SDK de `@modelcontextprotocol/sdk` directo (Node), el mismo patron que usa
`app/mcp/server.test.ts` para probar el server de punta a punta:

```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const client = new Client({ name: 'mi-cliente', version: '1.0.0' });
const transport = new StreamableHTTPClientTransport(new URL('http://<host>:3900/mcp'), {
  requestInit: { headers: { Authorization: 'Bearer <MCP_TOKEN>' } },
});
await client.connect(transport);
const { tools } = await client.listTools();
const resultado = await client.callTool({ name: 'panel_metricas', arguments: {} });
```

## Desarrollo local

```bash
MCP_TOKEN=lo-que-sea npm run mcp
```

Arranca en `http://localhost:3900` contra la misma `isps.db` que usa `npm run dev`
(mismo `ISPS_DB_PATH`/default que el resto de la app, ver `app/db/index.ts`).
