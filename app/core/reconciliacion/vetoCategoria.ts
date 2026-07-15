// Core puro (hexagonal): traduce el campo "Industria" de Notion al veto de
// clasificacion ISP. No toca la DB ni el adapter de Notion; T7 es quien
// escribe el flag resultante en empresa_clasificacion (fuente='notion') y
// hace la union con los vetos que ya vive alli.
export type VetoCategoria = 'es_utility_no_isp' | 'es_no_isp_confirmado' | null;

// Utilities: agua, energia y gas son servicios regulados, no ISP puro, pero
// tampoco son "no-isp confirmado" en el sentido de telco/otro rubro; la spec
// los separa en su propio flag para poder reportarlos aparte.
//
// Las llaves van normalizadas (sin acento, minusculas): el CSV real de Notion trae
// 'Energia' sin tilde pero 'Educación' con tilde -- el dato no es consistente y comparar
// el string crudo hacia fallar en silencio (bug real 2026-07-15, 21 empresas de energia
// quedaron como ISP). Misma familia que el NFC/NFD del notionExportAdapter.
const INDUSTRIAS_UTILITY = new Set(['agua', 'energia', 'gas', 'utility']);

// Telecom, Otro, Educacion y Pasarela: rubros ajenos a ISP confirmados por
// Notion, sin matiz de utility regulada.
const INDUSTRIAS_NO_ISP_CONFIRMADO = new Set(['telecom', 'otro', 'educacion', 'pasarela']);

// Quita acentos (NFD separa la letra de su tilde; el rango ̀-ͯ son las tildes
// combinantes), recorta y baja a minusculas.
function normalizarIndustria(industria: string): string {
  return industria.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

export function vetoCategoria(industria: string): VetoCategoria {
  const clave = normalizarIndustria(industria);
  if (INDUSTRIAS_UTILITY.has(clave)) return 'es_utility_no_isp';
  if (INDUSTRIAS_NO_ISP_CONFIRMADO.has(clave)) return 'es_no_isp_confirmado';
  return null;
}
