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
import {
  panelMetricas,
  dealHistoria,
  pipeline,
  registrarToqueTool,
  moverEstadoTool,
  cambiarCadenciaTool,
  marcarPerdidaTool,
  buscarEmpresaTool,
  crearEmpresaTool,
  actualizarEmpresaTool,
} from './tools';
import { CANALES, RESULTADOS } from '../db/validation';
import { ESTADOS_NOTION } from '../core/reconciliacion/mapeoEstados';
import { CATEGORIAS_EMPRESA } from '../core/empresa-identidad';

const NOMBRE_SERVIDOR = 'followups-panel-mcp';
const VERSION_SERVIDOR = '1.0.0';

// Organizacion default para las WRITE tools cuando el caller no la fija (solo el server
// standalone legacy, que hoy corre en modo solo-lectura y por tanto nunca registra escritura).
// El camino real (app/api/mcp/route.ts) SIEMPRE pasa la organizacion de la sesion.
const ORGANIZACION_DEFAULT = 1;

// Registra las tools de ESCRITURA (write-path, 2026-07-24). Se llaman SOLO si el caller
// autenticado paso el gate de escritura (puedeEscribirMcp) -- esa decision la toma route.ts,
// aca solo se cablean las tools contra la organizacion de esa sesion. Los inputSchema
// declaran el contrato para el cliente; la validacion dura (razonPerdida obligatoria, canal
// valido, etc.) la reimpone el dominio via Zod .parse(), no se confia solo en esto.
function registrarWriteTools(server: McpServer, idOrganizacion: number): void {
  const kdmShape = z
    .object({ nombre: z.string().min(1), telefono: z.string().min(1).optional() })
    .optional()
    .describe('Contacto decisor (KDM) opcional a enlazar/crear con el toque');

  server.registerTool(
    'registrar_toque',
    {
      description:
        'Registra un toque comercial (llamada/whatsapp/correo) sobre una empresa: escribe el evento, ' +
        'mueve el embudo si aplica y encola el sync a Notion. Envuelve registrarToque() del dominio.',
      inputSchema: {
        idEmpresa: z.string().min(1).describe('empresa.id_empresa'),
        canal: z.enum(CANALES),
        resultado: z.enum(RESULTADOS).describe("razonPerdida es obligatoria si resultado='contesto_no'"),
        quePaso: z.string().min(1).optional(),
        proximoFollowUp: z.string().min(1).optional().describe('YYYY-MM-DD'),
        proximoCanal: z.string().min(1).optional(),
        usuarios: z.number().optional(),
        crm: z.string().min(1).optional(),
        pasarela: z.string().min(1).optional(),
        razonPerdida: z.string().min(1).optional(),
        objecion: z.string().min(1).optional(),
        kdm: kdmShape,
      },
    },
    async (input) => {
      const r = registrarToqueTool(input as Parameters<typeof registrarToqueTool>[0], idOrganizacion);
      return { content: [{ type: 'text', text: JSON.stringify(r) }] };
    },
  );

  server.registerTool(
    'mover_estado',
    {
      description:
        'Mueve la etapa comercial (estado_notion) de una empresa y encola el cambio DB -> Notion. ' +
        'Envuelve actualizarEstadoNotion() del dominio.',
      inputSchema: {
        idEmpresa: z.string().min(1),
        estado: z.string().min(1).describe('slug de estado_notion: lead|contacto_iniciado|reunion_agendada|oportunidad|cierre_documentacion|enviar_contrato|firma_pago|on_hold'),
        fecha: z.string().optional().describe('YYYY-MM-DD para el historico. Default: hoy'),
      },
    },
    async ({ idEmpresa, estado, fecha }) => {
      const r = moverEstadoTool({ idEmpresa, estado, fecha }, idOrganizacion);
      return { content: [{ type: 'text', text: JSON.stringify(r) }] };
    },
  );

  server.registerTool(
    'cambiar_cadencia',
    {
      description:
        'Reprograma el seguimiento de una empresa (fecha/canal/proximo paso) y opcionalmente la mueve ' +
        'a otra cadencia (idCampana). Envuelve cambiarCadencia() del dominio.',
      inputSchema: {
        idEmpresa: z.string().min(1),
        idCampana: z.number().int().positive().optional().describe('Inscribe la empresa en la cadencia de esta campana'),
        proximoFollowUp: z.string().min(1).optional().describe('YYYY-MM-DD'),
        proximoCanal: z.string().min(1).optional(),
        proximoPaso: z.string().min(1).optional(),
      },
    },
    async (input) => {
      const r = cambiarCadenciaTool(input as Parameters<typeof cambiarCadenciaTool>[0], idOrganizacion);
      return { content: [{ type: 'text', text: JSON.stringify(r) }] };
    },
  );

  server.registerTool(
    'marcar_perdida',
    {
      description:
        'Marca una empresa como perdida/parqueada: registra un toque de perdida (razon obligatoria) y ' +
        'la pone en on_hold, encolando el sync a Notion. Envuelve marcarPerdida() del dominio.',
      inputSchema: {
        idEmpresa: z.string().min(1),
        canal: z.enum(CANALES),
        razonPerdida: z.string().min(1).describe('Por que se pierde/parquea la cuenta (obligatorio)'),
        quePaso: z.string().min(1).optional(),
        objecion: z.string().min(1).optional(),
      },
    },
    async (input) => {
      const r = marcarPerdidaTool(input as Parameters<typeof marcarPerdidaTool>[0], idOrganizacion);
      return { content: [{ type: 'text', text: JSON.stringify(r) }] };
    },
  );

  server.registerTool(
    'crear_empresa',
    {
      description:
        'Crea una cuenta nueva en el pipeline. Antes de insertar corre la misma busqueda de buscar_empresa: ' +
        'si aparece un candidato de confianza alta NO crea, devuelve el candidato para enlazarlo (forzar:true lo salta). ' +
        'El id sale del NIT si viene, si no de la convencion sintetica de la base. Envuelve crearEmpresa() del dominio.',
      inputSchema: {
        nombreOficial: z.string().min(1).describe('Nombre como se va a ver en el pipeline'),
        categoria: z.enum(CATEGORIAS_EMPRESA).describe('Obligatoria: decide el alcance del barrido'),
        estadoNotion: z.enum(ESTADOS_NOTION).describe('Etapa inicial del embudo'),
        owner: z.string().min(1).describe('Duenio comercial de la cuenta, tal como se escribe en el pipeline'),
        notionPageId: z.string().min(1).optional().describe('Pagina de Notion a enlazar. Unica: si ya esta tomada, falla'),
        nit: z.string().min(1).optional().describe('NIT sin puntos ni digito de verificacion. Si viene, ES el id de la cuenta'),
        forzar: z
          .boolean()
          .optional()
          .describe('Crea aunque haya un candidato de confianza alta. Solo cuando de verdad es otra empresa'),
      },
    },
    async (input) => {
      const r = crearEmpresaTool(input as Parameters<typeof crearEmpresaTool>[0], idOrganizacion);
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    },
  );

  server.registerTool(
    'actualizar_empresa',
    {
      description:
        'Cambia campos puntuales de una cuenta que ya existe y devuelve la fila releida. Solo escribe los campos ' +
        'que vengan; los que no vengan quedan como estaban. La etapa del embudo NO se cambia aca: para eso esta ' +
        'mover_estado, que ademas escribe el historial. Envuelve actualizarEmpresa() del dominio.',
      inputSchema: {
        idEmpresa: z.string().min(1),
        owner: z.string().min(1).optional(),
        categoria: z.enum(CATEGORIAS_EMPRESA).optional(),
        notionPageId: z.string().min(1).optional().describe('Enlaza la cuenta a una pagina de Notion. Unica'),
        proximoPaso: z.string().min(1).optional(),
        proximoFollowUpFecha: z.string().min(1).optional().describe('YYYY-MM-DD'),
        proximoCanal: z.string().min(1).optional(),
      },
    },
    async (input) => {
      const r = actualizarEmpresaTool(input as Parameters<typeof actualizarEmpresaTool>[0], idOrganizacion);
      return { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }] };
    },
  );
}

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
// opts.escritura (write-path, 2026-07-24): registra ADEMAS las 4 write tools, atadas a
// opts.idOrganizacion (la de la sesion). Default false: el server standalone legacy
// (crearServidorMcp) lo llama sin opts y queda SOLO LECTURA, igual que antes. Solo el camino
// OAuth de Next (app/api/mcp/route.ts) opta por escritura, y SOLO tras pasar puedeEscribirMcp.
export function crearMcpServer(opts: { escritura?: boolean; idOrganizacion?: number } = {}): McpServer {
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

  // LECTURA, aunque su razon de ser sea alimentar una escritura: buscar_empresa no toca
  // nada, y exigirle el permiso de escritura dejaria a un lector sin poder responder "esta
  // cuenta ya existe?" -- que es la pregunta que evita el duplicado.
  server.registerTool(
    'buscar_empresa',
    {
      description:
        'Busca si una cuenta ya existe, por los CUATRO frentes a la vez: empresa (nombre oficial y normalizado), ' +
        'alias, lista de prospeccion (nombre crudo, website, telefonos) y contactos (telefono, dominio del email). ' +
        'Devuelve cada candidato con de que frente salio y con que confianza. Correrla antes de crear es lo que ' +
        'evita duplicados.',
      inputSchema: {
        nombre: z.string().min(1).describe('Nombre a buscar. Se normaliza quitando sufijos legales (SAS, SA, ESP, LTDA...)'),
        telefono: z.string().min(1).optional().describe('Cruza contra contactos y prospeccion. Se usan los 10 digitos, sin indicativo ni signos'),
        dominio: z.string().min(1).optional().describe('Dominio, URL o email. Cruza contra el website de prospeccion y el email de los contactos'),
        nit: z.string().min(1).optional().describe('Match exacto contra el id de la cuenta'),
      },
    },
    async ({ nombre, telefono, dominio, nit }) => {
      const resultado = buscarEmpresaTool({ nombre, telefono, dominio, nit });
      return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
    },
  );

  if (opts.escritura) {
    registrarWriteTools(server, opts.idOrganizacion ?? ORGANIZACION_DEFAULT);
  }

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
