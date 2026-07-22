// MRR estimado (Fase 4, metrica 4 del plan-produccion-cro-campana.md): formula que dio
// Sebastian -- usuarios x %digital x tarifa_txn_plan + saas_mensual. Puro: no lee
// configuracion_admin ni Notion, solo hace la cuenta con los numeros que ya le paso el
// caller (Repository / endpoint).
//
// Por que no busca el dato solo: se investigo el schema (empresa_usuarios, empresa) y
// app/adapters/notion/ (notionExportAdapter.ts + los fixtures/CSV) ANTES de escribir esto
// y NINGUNO trae %digital, tarifa_txn_plan o saas_mensual -- ni tabla, ni columna, ni
// mapeo de Notion. "MRR potencial" existe como columna del CSV crudo de Notion pero no
// esta wireada a ninguna tabla (dato muerto en el fixture). Inventar esos tres numeros
// aca violaria CLAUDE.md/Decision 1 (no inventar metricas). En vez de eso: la formula
// vive aca, pura y testeada: y quien la llama (Repository) saca tarifa_txn_plan /
// saas_mensual de configuracion_admin (mismo mecanismo clave/valor que ya usa el buzon de
// Apollo en /conectores, sin migracion nueva) y %digital cae al default de abajo porque
// hoy no existe una fuente real por empresa.

export type MrrInput = {
  usuarios: number;
  digitalPct: number; // 0..1
  tarifaTxnPlan: number; // COP por transaccion digital, valor del plan
  saasMensual: number; // COP, cuota fija mensual del plan
};

export function calcularMrrEstimado(input: MrrInput): number {
  return input.usuarios * input.digitalPct * input.tarifaTxnPlan + input.saasMensual;
}

// Plan (Fase 4, tarea 9): "%digital por empresa de Notion (100% default)". Notion no trae
// hoy ese campo per-empresa (ver comentario de arriba), asi que el default aplica siempre
// hasta que aparezca una fuente real -- documentado, no escondido.
export function digitalPctConDefault(valor: number | null | undefined): number {
  return valor === null || valor === undefined ? 1 : valor;
}
