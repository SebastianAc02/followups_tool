// Protected Resource Metadata (RFC 9728) en la raiz del origen -- mismo motivo que el
// vecino oauth-authorization-server/route.ts: el WWW-Authenticate del 401 ya resuelve esta
// URL bajo /api/auth/.well-known/..., esta ruta es la version "adivinable" en la raiz que
// algunos clientes MCP prueban primero. oAuthProtectedResourceMetadata(auth) es el helper
// real del plugin `mcp` (better-auth/plugins), llama auth.api.getMCPProtectedResource.
import { oAuthProtectedResourceMetadata } from 'better-auth/plugins';
import { auth } from '../../lib/auth';

export const GET = oAuthProtectedResourceMetadata(auth);
