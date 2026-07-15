// Core puro (hexagonal): traduce el campo "Industria" de Notion al veto de
// clasificacion ISP. No toca la DB ni el adapter de Notion; T7 es quien
// escribe el flag resultante en empresa_clasificacion (fuente='notion') y
// hace la union con los vetos que ya vive alli.
export type VetoCategoria = 'es_utility_no_isp' | 'es_no_isp_confirmado' | null;

// Utilities: agua, energia y gas son servicios regulados, no ISP puro, pero
// tampoco son "no-isp confirmado" en el sentido de telco/otro rubro; la spec
// los separa en su propio flag para poder reportarlos aparte.
const INDUSTRIAS_UTILITY = new Set(['Agua', 'Energía', 'Gas', 'Utility']);

// Telecom, Otro, Educacion y Pasarela: rubros ajenos a ISP confirmados por
// Notion, sin matiz de utility regulada.
const INDUSTRIAS_NO_ISP_CONFIRMADO = new Set(['Telecom', 'Otro', 'Educación', 'Pasarela']);

export function vetoCategoria(industria: string): VetoCategoria {
  if (INDUSTRIAS_UTILITY.has(industria)) return 'es_utility_no_isp';
  if (INDUSTRIAS_NO_ISP_CONFIRMADO.has(industria)) return 'es_no_isp_confirmado';
  return null;
}
