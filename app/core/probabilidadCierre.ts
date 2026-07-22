// Probabilidad de cierre por etapa (Fase 4, metrica 5 del plan-produccion-cro-campana.md,
// campo del endpoint de solo lectura). Heuristica, no dato medido: no existe en esta tool
// ningun historico de "cuantos deals en cada etapa terminaron cerrando" para calcular una
// probabilidad real todavia (CLAUDE.md/Decision 1: no inventar metricas que no existen).
//
// Lo que SI existe es el orden de calor que ya usa colaDelDia en app/db/repository.ts
// (calorDesc, el CASE que prioriza la cola) -- ese orden es juicio real de negocio ya
// codificado, no una invencion nueva. Esta funcion traduce ESE MISMO orden a un numero
// 0..1, con los valores intermedios elegidos a mano (no medidos). Marcado explicitamente
// como heuristica en el shape de retorno para que el consumidor (endpoint REST) no lo
// confunda con probabilidad real -- Sebastian puede recalibrar los numeros aca sin tocar
// nada mas.
export type ProbabilidadCierre = {
  valor: number; // 0..1
  metodo: 'heuristica_por_etapa';
};

const PROBABILIDAD_POR_ETAPA: Record<string, number> = {
  firma_pago: 1,
  cierre_documentacion: 0.85,
  enviar_contrato: 0.85,
  reunion_agendada: 0.55,
  oportunidad: 0.55,
  contacto_iniciado: 0.3,
  lead: 0.1,
  on_hold: 0.05,
};

const PROBABILIDAD_DEFAULT = 0.15; // etapa sin mapear explicito (dato nuevo de Notion, etc.)

export function probabilidadCierrePorEtapa(estado: string | null): ProbabilidadCierre {
  const valor = estado !== null && estado in PROBABILIDAD_POR_ETAPA ? PROBABILIDAD_POR_ETAPA[estado] : PROBABILIDAD_DEFAULT;
  return { valor, metodo: 'heuristica_por_etapa' };
}
