// Catalogo de widgets del cockpit (core, puro). Decision de diseno (Tarea 3 del plan):
// dataSource es un union de string literals (DataSourceKey), no un string opaco ni un
// enum runtime. Motivo: metricas.ts hace `switch (dataSource)` sobre este mismo tipo, y
// TypeScript exige exhaustividad en ese switch (falla en build si agrego un widget con
// una key nueva y se me olvida resolverla) sin necesitar un objeto enum aparte en runtime.
// Un widget SIN fuente real hoy queda en la biblioteca con dataSource: null (se ve, pero
// muestra "sin datos"); no lo saco del catalogo porque el mockup lo trae y el plan pide
// portar el shell visual completo.

export type WidgetTipo = 'kpi' | 'tendencia' | 'barras' | 'histograma' | 'lista';
export type WidgetGrupo = 'throughput' | 'velocity' | 'segmentacion' | 'economia' | 'probabilidad';

// Las unicas fuentes que HOY resuelven contra datos reales (ver app/db/repository.ts).
// Todo lo demas (deals, show rate, pipeline ponderado, etc.) no existe en esta tool y
// queda null a proposito -- CLAUDE.md / Decision 1 del plan: no inventar metricas CRO.
export type DataSourceKey =
  | 'toquesTotal'
  | 'promedioDiario'
  | 'leadsTocados'
  | 'toquesPorCanal'
  | 'toquesPorResultado'
  | 'campanasActivas'
  | 'inscripcionesActivas'
  | 'empresasPorCadencia';

export type Widget = {
  id: string; // estable, ej 'toques_por_canal'
  titulo: string;
  grupo: WidgetGrupo;
  tipo: WidgetTipo;
  dataSource: DataSourceKey | null;
  spanDefault: 1 | 2 | 3 | 4;
};

export const WIDGETS: readonly Widget[] = [
  // Throughput
  { id: 'deals_nuevos', titulo: 'Deals nuevos', grupo: 'throughput', tipo: 'kpi', dataSource: null, spanDefault: 1 },
  { id: 'reuniones_agendadas', titulo: 'Reuniones agendadas', grupo: 'throughput', tipo: 'kpi', dataSource: null, spanDefault: 1 },
  { id: 'show_rate', titulo: 'Show rate', grupo: 'throughput', tipo: 'kpi', dataSource: null, spanDefault: 1 },
  { id: 'reschedule_rate', titulo: 'Reschedule rate', grupo: 'throughput', tipo: 'kpi', dataSource: null, spanDefault: 1 },
  { id: 'toques_total', titulo: 'Toques totales', grupo: 'throughput', tipo: 'kpi', dataSource: 'toquesTotal', spanDefault: 1 },
  { id: 'promedio_diario', titulo: 'Promedio diario', grupo: 'throughput', tipo: 'kpi', dataSource: 'promedioDiario', spanDefault: 1 },
  { id: 'leads_tocados', titulo: 'Leads tocados', grupo: 'throughput', tipo: 'kpi', dataSource: 'leadsTocados', spanDefault: 1 },

  // Velocity / cycle time
  { id: 'lead_a_cliente', titulo: 'Lead → cliente', grupo: 'velocity', tipo: 'tendencia', dataSource: null, spanDefault: 1 },
  { id: 'matar_deal_post_reunion', titulo: 'Matar deal post-reunion', grupo: 'velocity', tipo: 'tendencia', dataSource: null, spanDefault: 1 },
  { id: 'follow_up_por_deal', titulo: 'Follow-up por deal', grupo: 'velocity', tipo: 'tendencia', dataSource: null, spanDefault: 1 },
  { id: 'toques_antes_cerrar', titulo: 'Toques antes de cerrar/morir', grupo: 'velocity', tipo: 'tendencia', dataSource: null, spanDefault: 1 },

  // Segmentacion
  { id: 'segmentacion_persona', titulo: 'Segmentacion por persona', grupo: 'segmentacion', tipo: 'lista', dataSource: null, spanDefault: 4 },
  { id: 'toques_por_canal', titulo: 'Toques por canal', grupo: 'segmentacion', tipo: 'barras', dataSource: 'toquesPorCanal', spanDefault: 2 },
  { id: 'toques_por_resultado', titulo: 'Toques por resultado', grupo: 'segmentacion', tipo: 'barras', dataSource: 'toquesPorResultado', spanDefault: 2 },

  // Economia del deal
  { id: 'weighted_pipeline', titulo: 'Weighted pipeline $', grupo: 'economia', tipo: 'kpi', dataSource: null, spanDefault: 2 },
  { id: 'ticket_promedio', titulo: 'Ticket promedio', grupo: 'economia', tipo: 'kpi', dataSource: null, spanDefault: 1 },
  { id: 'campanas_activas', titulo: 'Campañas activas', grupo: 'economia', tipo: 'kpi', dataSource: 'campanasActivas', spanDefault: 1 },
  { id: 'inscripciones_activas', titulo: 'Inscripciones corriendo', grupo: 'economia', tipo: 'kpi', dataSource: 'inscripcionesActivas', spanDefault: 1 },

  // Probabilidad de cierre
  { id: 'probabilidad_cierre', titulo: 'Probabilidad de cierre', grupo: 'probabilidad', tipo: 'histograma', dataSource: null, spanDefault: 4 },
  { id: 'empresas_por_cadencia', titulo: 'Empresas por cadencia', grupo: 'probabilidad', tipo: 'barras', dataSource: 'empresasPorCadencia', spanDefault: 2 },
] as const;

export function widgetPorId(id: string): Widget | undefined {
  return WIDGETS.find((w) => w.id === id);
}
