// Follow-up por deal (widget del cockpit, conectado 2026-07-22): promedio de toques por
// deal dentro de la ventana. Puro: recibe los DOS conteos que el Repository YA calcula
// para otros widgets del mismo panel (toquesTotal via contarToquesEnRango, deals via
// leadsTocadosEnRango) y solo hace la division -- mismo patron que promedioDiario en
// app/core/actividad.ts (nunca reconsulta la DB, nunca calcula fechas aca).
//
// "Deal" aca es exactamente "empresa distinta con al menos un toque en el rango" (lo que
// ya cuenta leadsTocadosEnRango), no una etapa de pipeline especifica -- es la definicion
// que pidio la tarea (count toques / count empresas distintas con toque).
export function calcularFollowUpPorDeal(toquesTotal: number, dealsConToque: number): number {
  if (dealsConToque <= 0) return 0;
  return Math.round((toquesTotal / dealsConToque) * 10) / 10;
}
