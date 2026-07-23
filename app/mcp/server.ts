// MCP server de solo lectura (Fase 3, docs/plan-panel-metricas-tiempo-real.md): expone
// las metricas del panel y la historia de deals por HTTP, para que Claude (o cualquier
// cliente MCP) las consulte sin abrir la UI.
//
// Proceso Node aparte, NO una route de Next (igual que app/worker/index.ts): el worker ya
// establecio el patron de "reusar la imagen de followups-web con otro `command:` en
// Compose" -- este server sigue el mismo patron (ver docker-compose.mcp.yml). Vive fuera
// del arbol de app/api a proposito: las routes de Next pasan por requireSession (cookie de
// better-auth), y este server se autentica por token porque no hay navegador ni sesion de
// usuario en el otro extremo (Claude, un curl, otro proceso).
//
// crearServidorMcp() NO llama .listen(): retorna el http.Server ya armado para que
// server.test.ts pueda levantarlo en un puerto efimero (0) sin pisar el puerto real. El
// entrypoint de despliegue es index.ts (el que corre `command:` en Compose).
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { tokenDeHeaders, tokenValido } from './auth';
import { panelMetricas, dealHistoria, pipeline } from './tools';

const NOMBRE_SERVIDOR = 'followups-panel-mcp';
const VERSION_SERVIDOR = '1.0.0';

// Un McpServer nuevo por request (modo "stateless" del SDK, sessionIdGenerator: undefined,
// ver el ejemplo simpleStatelessStreamableHttp.js del propio paquete): este server es de
// solo lectura y sin volumen -- no hay ninguna razon para pagar el estado de sesiones
// (reconexion, resumibilidad) que el modo stateful ofrece. Cada tool call es una foto de
// la DB en ese instante, no una conversacion con memoria.
// Exportada (2026-07-23): app/api/mcp/route.ts (wiring OAuth dentro de Next, ver
// docs/superpowers/specs/2026-07-23-mcp-oauth-login-design.md) la reusa tal cual para no
// duplicar las 3 declaraciones de tool -- unico cambio de esa fase es el TRANSPORTE/AUTH
// (StreamableHTTPServerTransport+token aca, WebStandardStreamableHTTPServerTransport+OAuth
// alla), nunca la forma del McpServer.
export function crearMcpServer(): McpServer {
  const server = new McpServer({ name: NOMBRE_SERVIDOR, version: VERSION_SERVIDOR });

  server.registerTool(
    'panel_metricas',
    {
      description:
        'Metricas del panel del CRO: tiempo promedio en cada etapa, ciclo de venta promedio, ' +
        'conversion stage->stage y MRR total estimado. Todas de solo lectura, sobre isps.db real.',
      inputSchema: {
        idOrganizacion: z.number().int().positive().optional().describe('Default: 1 (Onepay, unica organizacion real hoy)'),
        owner: z.string().optional().describe('Filtra SOLO conversionStage (las otras 3 metricas son vista del CRO sobre toda la organizacion)'),
        ahora: z.string().optional().describe('Fecha de corte yyyy-mm-dd para tiempoPromedioPorEtapa/cicloVentaPromedio. Default: hoy'),
      },
    },
    async ({ idOrganizacion, owner, ahora }) => {
      const resultado = panelMetricas({ idOrganizacion, owner, ahora });
      return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
    },
  );

  server.registerTool(
    'deal_historia',
    {
      description:
        'Historia de un deal (empresa): etapa actual, transiciones de etapa con fecha, plan asignado, ' +
        'MRR potencial, %digital, probabilidad de cierre (heuristica por etapa) y usuarios efectivos.',
      inputSchema: {
        idEmpresa: z.string().min(1).describe('empresa.id_empresa'),
        idOrganizacion: z.number().int().positive().optional().describe('Default: 1 (Onepay)'),
      },
    },
    async ({ idEmpresa, idOrganizacion }) => {
      const resultado = dealHistoria({ idEmpresa, idOrganizacion });
      return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
    },
  );

  server.registerTool(
    'pipeline',
    {
      description:
        'Lista de deals del pipeline con sus cifras: etapa, deal size (usuarios), probabilidad de cierre, ' +
        'plan, %digital y revenue estimado. Mismo dato que expone GET /api/panel/pipeline.',
      inputSchema: {
        idOrganizacion: z.number().int().positive().optional().describe('Default: 1 (Onepay)'),
      },
    },
    async ({ idOrganizacion }) => {
      const resultado = pipeline({ idOrganizacion });
      return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
    },
  );

  return server;
}

function responderJson(res: ServerResponse, status: number, cuerpo: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(cuerpo));
}

const RUTA_MCP = '/mcp';
const RUTA_HEALTH = '/health';

// El health check NO exige token: es el mismo trato que /api/health en la app principal
// (sin dato de negocio, solo "el proceso esta vivo"), lo usa el healthcheck de Compose.
async function manejarHealth(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  responderJson(res, 200, { status: 'ok' });
}

async function manejarMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    // GET/DELETE en modo stateless no aplican (no hay sesion que reabrir ni cerrar) --
    // mismo 405 JSON-RPC que el ejemplo stateless del SDK.
    responderJson(res, 405, { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
    return;
  }

  const token = tokenDeHeaders(req.headers);
  if (!tokenValido(token)) {
    responderJson(res, 401, { error: 'token invalido o ausente' });
    return;
  }

  const mcpServer = crearMcpServer();
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);
    res.on('close', () => {
      transport.close();
      mcpServer.close();
    });
  } catch (e) {
    console.error('[mcp] error manejando request:', e);
    if (!res.headersSent) {
      responderJson(res, 500, { jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
}

export function crearServidorMcp(): http.Server {
  return http.createServer((req, res) => {
    const ruta = req.url?.split('?')[0];
    if (ruta === RUTA_HEALTH) {
      void manejarHealth(req, res);
      return;
    }
    if (ruta === RUTA_MCP) {
      void manejarMcp(req, res);
      return;
    }
    responderJson(res, 404, { error: 'ruta no encontrada' });
  });
}
