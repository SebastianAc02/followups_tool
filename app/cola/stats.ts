import type { ContadoresHoy } from "../db/repository";

// DECISION DE NEGOCIO (Sebastian) -- no adivinar.
//
// contadoresHoy.porResultado trae las 4 salidas posibles de un toque (ver comentario de
// dominio en app/db/validation.ts): contesto_reunion, contesto_sigue_seguimiento,
// contesto_no, no_contesto. El stat "cerradas" del header (mockup: "3 cerradas", en azul)
// necesita saber cuales de esas 4 cuentan como "cerrada" hoy.
//
// Pistas del dominio, no la respuesta:
// - contadores.total cuenta TODO toque de hoy, incluidos valores legado fuera del enum.
// - RESULTADOS_CONTESTO (validation.ts) ya agrupa "hubo conversacion real" y excluye
//   no_contesto explicitamente para otro proposito (disparar Granola).
//
// TODO(Sebastian): implementar la regla real.
export function contarCerradas(contadores: ContadoresHoy): number {
  return 0;
}
