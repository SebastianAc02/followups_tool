// MRR estimado -- usuarios x %digital x tarifa_txn_plan + saas_mensual. Puro: no lee la
// tabla `plan` ni Notion, solo hace la cuenta con los numeros que ya le paso el caller
// (Repository / endpoint).
//
// 2026-07-22 (plan-panel-metricas-tiempo-real.md): este modelo YA existe en Notion (DB
// "Planes" + rollups Tarifa TXN Plan / SaaS Plan + formula MRR potencial en el pipeline).
// Se porta, no se inventa -- tarifa_txn_plan/saas_mensual salen de la tabla `plan`
// (catalogo local, sembrado desde ese mismo catalogo de Notion), relacionada al deal por
// empresa.idPlan. Deals sin plan asignado no aportan al total (ver mrrEstimadoTotal en
// repository.ts): no hay tarifa razonable que inventarles.

export type MrrInput = {
  usuarios: number;
  digitalPct: number; // 0..1
  tarifaTxnPlan: number; // COP por transaccion digital, valor del plan
  saasMensual: number; // COP, cuota fija mensual del plan
};

export function calcularMrrEstimado(input: MrrInput): number {
  return input.usuarios * input.digitalPct * input.tarifaTxnPlan + input.saasMensual;
}

// %digital por deal (empresa.pctDigital), capturado en el discovery. Sin ese dato, el
// default es 40%: la constante fija que ya usa la formula real de Notion (verificada
// 2026-07-22 contra un deal real -- 4.000 usuarios, plan Pro, 40% x 1.680 + 1.800.000 =
// 4.488.000, MRR potencial exacto). Antes este default era 100% (caso limite, sin
// descuento); se corrigio a 40% para que el numero no cambie al pasar de Notion a la
// tool. Un valor explicito del discovery (incluido 0) nunca se pisa.
const DIGITAL_PCT_DEFAULT = 0.4;

export function digitalPctConDefault(valor: number | null | undefined): number {
  return valor === null || valor === undefined ? DIGITAL_PCT_DEFAULT : valor;
}
