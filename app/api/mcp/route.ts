// Endpoint MCP con login OAuth (2026-07-23,
// docs/superpowers/specs/2026-07-23-mcp-oauth-login-design.md): mismo origen que Better
// Auth (https://followupsonepay.duckdns.org), asi que discovery + login + token quedan
// resueltos por el plugin `mcp` (app/lib/auth.ts) sin CORS cross-origin. Reemplaza el token
// bearer manual de app/mcp/server.ts para el uso real desde Claude -- ese proceso standalone
// NO se borra (docker-compose.mcp.yml sigue existiendo), solo deja de ser el camino
// desplegado; ver el Caddyfile.
//
// withMcpAuth (better-auth/plugins) hace TODO el trabajo de autenticacion: valida el bearer
// token contra la tabla oauth_access_token y, si falta o es invalido, responde 401 con
// WWW-Authenticate apuntando al resource metadata -- asi Claude descubre el authorization
// server e inicia el login solo. No se rueda ninguna validacion de token a mano aca.
//
// Lo que SI toca este archivo es el gate de ROL despues de esa autenticacion: withMcpAuth
// entrega un OAuthAccessToken (accessToken/clientId/userId/scopes), no el UsuarioSesion con
// admin/verTodoPipeline/owner -- ese mapeo lo hace usuarioSesionDesdeOAuth
// (app/lib/mcp-sesion.ts) y la decision la toma puedeQuerearMcp (app/lib/mcp-gate.ts). Un
// Visitante autenticado (login valido, sin rol) pasa el 401 pero se queda aca: 403, sin
// datos.
import { withMcpAuth } from 'better-auth/plugins';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { auth } from '../../lib/auth';
import { crearMcpServer } from '../../mcp/server';
import { usuarioSesionDesdeOAuth } from '../../lib/mcp-sesion';
import { puedeQuerearMcp } from '../../lib/mcp-gate';

function respuestaForbidden(): Response {
  return Response.json(
    {
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Forbidden: esta cuenta no tiene acceso al pipeline de Onepay' },
      id: null,
    },
    { status: 403 },
  );
}

export const POST = withMcpAuth(auth, async (req, oauthSession) => {
  const sesion = usuarioSesionDesdeOAuth(oauthSession.userId);
  if (!sesion || !puedeQuerearMcp(sesion)) {
    return respuestaForbidden();
  }

  // Un McpServer + transport nuevo por request (modo stateless, sessionIdGenerator:
  // undefined): mismo criterio que app/mcp/server.ts -- este MCP es de solo lectura y sin
  // volumen, no hay razon para pagar el estado de sesiones del modo stateful.
  const mcpServer = crearMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await mcpServer.connect(transport);
  return transport.handleRequest(req);
});
