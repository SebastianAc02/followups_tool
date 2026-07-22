// Tasa de cambio de stage / velocity (Fase 4, metrica 3 del plan). Puro: recibe el conteo
// de transiciones ya calculado por el Repository (COUNT sobre empresa_estado_historial en
// un rango) y el tamano del rango en dias, y solo hace la division. El "cuantos dias tiene
// el rango" se lo pasa el caller (mismo patron que promedioDiario en core/actividad.ts:
// nunca calcula fechas aca adentro).
export function calcularVelocidadCambioEtapa(transiciones: number, diasEnRango: number): number {
  if (diasEnRango <= 0) return 0;
  return transiciones / diasEnRango;
}
