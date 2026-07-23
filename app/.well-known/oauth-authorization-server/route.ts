// Discovery OAuth (RFC 8414) en la raiz del origen (2026-07-23,
// docs/superpowers/specs/2026-07-23-mcp-oauth-login-design.md): el 401 de app/api/mcp/route.ts
// ya apunta al metadata bajo /api/auth/.well-known/... (asi lo arma withMcpAuth solo, con el
// basePath de Better Auth), pero algunos clientes MCP prueban la convencion de raiz ANTES de
// hacer la primera request sin token. oAuthDiscoveryMetadata(auth) es el helper real del
// plugin `mcp` (no se rueda el JSON a mano): llama auth.api.getMcpOAuthConfig por debajo, el
// mismo endpoint que sirve el catch-all de better-auth.
import { oAuthDiscoveryMetadata } from 'better-auth/plugins';
import { auth } from '../../lib/auth';

export const GET = oAuthDiscoveryMetadata(auth);
