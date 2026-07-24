// Gate de acceso al MCP del panel (login OAuth, 2026-07-23,
// docs/superpowers/specs/2026-07-23-mcp-oauth-login-design.md). Puro y testeado sin DB ni
// Next: recibe el UsuarioSesion YA resuelto (app/lib/mcp-sesion.ts arma ese objeto desde el
// userId del OAuthAccessToken) y decide si puede leer datos reales de Onepay por MCP. Es el
// UNICO lugar que conoce el criterio -- app/api/mcp/route.ts solo lo llama, no reimplementa
// ninguna de las tres condiciones.
//
// Tres caminos, cualquiera basta:
//   - admin: ya ve todo (panel, conectores de equipo).
//   - verTodoPipeline: rol CRO (Camilo, Fase 3 plan-produccion-cro-campana.md), ve todo el
//     pipeline en lectura sin ser admin.
//   - owner real de Onepay: cualquier miembro del equipo con un owner mapeado, en la
//     organizacion real (no "Visitantes"). soloLectura ya ES ese chequeo -- resolverMembresia
//     (app/lib/resolucion-sesion.ts) lo pone en true unicamente cuando la membresia es de
//     "Visitantes" -- asi que "organizacion = Onepay, no Visitantes" es exactamente
//     `!sesion.soloLectura`, sin inventar una segunda fuente de verdad para lo mismo.
//
// Un Visitante logueado (soloLectura=true, sin admin ni verTodoPipeline) SIEMPRE cae fuera:
// ese es el caso que este gate existe para bloquear (spec: "Un Visitante logueado -> 403,
// sin datos").
import type { UsuarioSesion } from './session-user';

export function puedeQuerearMcp(sesion: UsuarioSesion): boolean {
  if (sesion.admin) return true;
  if (sesion.verTodoPipeline) return true;
  return sesion.owner.trim().length > 0 && !sesion.soloLectura;
}

// Gate de ESCRITURA del MCP (write-path, 2026-07-24, integraciones/propuesta-write-path.md).
// Separado del de lectura A PROPOSITO: se puede revocar la escritura (escrituraMcp=false) sin
// perder la lectura (puedeQuerearMcp sigue en true). Reglas:
//   - primero tiene que poder LEER (todo escritor lee).
//   - el flag dedicado escrituraMcp tiene que estar encendido. NO se hereda de admin ni de
//     ser owner: es un permiso que se concede aparte (script de seed / UPDATE a mano), para
//     que "quien puede registrar toques reales en produccion" sea una decision explicita.
// Un Visitante (soloLectura) nunca escribe: ya falla puedeQuerearMcp.
export function puedeEscribirMcp(sesion: UsuarioSesion): boolean {
  if (!puedeQuerearMcp(sesion)) return false;
  return sesion.escrituraMcp === true;
}
