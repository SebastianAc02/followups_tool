// Conversion stage -> stage (Fase 4, metrica 5 del plan-produccion-cro-campana.md):
// distinta de calcularVelocidadCambioEtapa (core/velocity.ts, que mide transiciones/dia,
// throughput). Esta mide, de los deals que llegaron a una etapa, que % avanzo a la
// siguiente. Puro: recibe por empresa la etapa actual + los estado_nuevo que aparecen en
// su historial (ya leidos por el Repository, ver empresasParaConversionStage en
// app/db/repository.ts) y el orden del funnel ya resuelto en un array de strings -- no
// importa app/db/funnel.ts ni el driver de DB, el caller decide el orden.
//
// ★ Insight -- "llego a la etapa" es un high-water-mark, no un chequeo puntual.
// Se audito empresa_estado_historial en produccion (isps.db, 2026-07-22) y la tabla SI
// tiene reversiones reales: contacto_iniciado->lead (13 filas), on_hold->lead (5),
// firma_pago->lead (2), oportunidad->lead (1), reunion_agendada->lead (1). Si "llego a X"
// se definiera como "su etapa ACTUAL es >= X", estas empresas perderian el credito de haber
// alcanzado oportunidad/reunion_agendada/etc solo porque un ajuste manual las devolvio a
// lead despues. Por eso una empresa cuenta para la etapa X si el rank MAS ALTO que tocó
// alguna vez (max entre su etapa actual y cualquier estado_nuevo de su historial, dentro
// del orden del funnel) es >= rank(X) -- un avance real que despues se enfrio sigue siendo
// un avance real para efectos de conversion.
//
// Alternativa descartada: contar SOLO estado_nuevo=X en el historial (ignorar la etapa
// actual). Se descarta porque "lead" casi nunca tiene una fila explicita de "entre a lead"
// -- es el estado default con el que arranca una empresa ANTES de que empiece a trackear
// transiciones (mismo hueco documentado en historialEtapasEmpresa: "el pasado pre-deploy es
// desconocido a proposito"). Contar asi hundiria el denominador de lead->contacto_iniciado
// a casi cero, un numero falso, no un "sin datos" honesto.
//
// on_hold queda fuera a proposito: si el caller no lo incluye en `ordenEtapas`, ni suma ni
// resta (es lateral al funnel, ver docs/funnel.ts).
export type EmpresaFunnelInput = {
  idEmpresa: string;
  estadoActual: string | null;
  estadosHistorial: string[]; // estado_nuevo de cada fila del historial de esa empresa
};

export function calcularConversionStage(
  empresas: readonly EmpresaFunnelInput[],
  ordenEtapas: readonly string[],
): Record<string, number> {
  const rank = new Map<string, number>();
  ordenEtapas.forEach((etapa, i) => rank.set(etapa, i));

  const llegaron = new Array(ordenEtapas.length).fill(0);

  for (const emp of empresas) {
    let maxRank = -1;
    const rActual = emp.estadoActual !== null ? rank.get(emp.estadoActual) : undefined;
    if (rActual !== undefined && rActual > maxRank) maxRank = rActual;
    for (const estado of emp.estadosHistorial) {
      const r = rank.get(estado);
      if (r !== undefined && r > maxRank) maxRank = r;
    }
    if (maxRank < 0) continue; // nunca toco el funnel (sin estado, o solo on_hold sin historial)
    for (let i = 0; i <= maxRank; i++) llegaron[i] += 1;
  }

  // Un par (A->B) sin deals en A (llegaron[A] === 0) se omite -- no se inventa un 0/0.
  // "0 conversion" solo se reporta cuando SI hubo deals en A y ninguno avanzo a B.
  const out: Record<string, number> = {};
  for (let i = 0; i < ordenEtapas.length - 1; i++) {
    const denominador = llegaron[i];
    if (denominador === 0) continue;
    const key = `${ordenEtapas[i]}→${ordenEtapas[i + 1]}`;
    out[key] = Math.round((llegaron[i + 1] / denominador) * 1000) / 1000;
  }
  return out;
}
