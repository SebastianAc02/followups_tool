// Traduce el userId de un OAuthAccessToken (plugin `mcp` de Better Auth, ver
// app/api/mcp/route.ts) al mismo UsuarioSesion que requireSession() arma para las paginas
// (app/lib/session.ts) -- para que puedeQuerearMcp (app/lib/mcp-gate.ts) sea el UNICO
// criterio de acceso, sin duplicar la logica de admin/verTodoPipeline/owner en el wiring
// OAuth del MCP.
//
// A diferencia de requireSession(): withMcpAuth ya valido el bearer token y entrego el
// OAuthAccessToken (accessToken/clientId/userId/scopes) ANTES de que este modulo se llame --
// no hay cookie de navegador, no hay next/headers, no hay redirect. Un resultado null
// significa "no se pudo resolver la identidad" (usuario borrado o sin membresia todavia:
// mismo caso 'sin-membresia' que requireSession manda a /reclamar, pero aca no hay pagina a
// donde redirigir, asi que el llamador lo trata como acceso denegado).
import { usuarioPorId, organizacionDeUsuario } from '../db/organizacion-repository';
import { usuarioDeSesion, type UsuarioSesion } from './session-user';
import { resolverMembresia } from './resolucion-sesion';

export function usuarioSesionDesdeOAuth(idUsuario: string): UsuarioSesion | null {
  const usuario = usuarioPorId(idUsuario);
  if (!usuario) return null;

  const membresia = organizacionDeUsuario(idUsuario);
  const resolucion = resolverMembresia(membresia);
  if (resolucion.tipo === 'sin-membresia') return null;

  return usuarioDeSesion(usuario, resolucion.idOrganizacion, resolucion.soloLectura);
}
