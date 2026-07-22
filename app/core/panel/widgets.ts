// Catalogo de widgets del cockpit (core, puro). Decision de diseno (Tarea 3 del plan):
// dataSource es un union de string literals (DataSourceKey), no un string opaco ni un
// enum runtime. Motivo: metricas.ts hace `switch (dataSource)` sobre este mismo tipo, y
// TypeScript exige exhaustividad en ese switch (falla en build si agrego un widget con
// una key nueva y se me olvida resolverla) sin necesitar un objeto enum aparte en runtime.
//
// Decision de Sebastian (2026-07-22): un widget SIN fuente real ya NO se queda en el
// catalogo mostrando "sin datos" para siempre -- eso era el estado transitorio del
// mockup portado tal cual, no un estado final. Se audito la data real (isps.db) widget
// por widget: los que tenian fuente real se conectaron (ver abajo); los 6 que NO
// (show_rate, reschedule_rate, weighted_pipeline, ticket_promedio,
// matar_deal_post_reunion, probabilidad_cierre) se sacaron del catalogo -- no hay monto
// ni deal size en la DB, ni señal de "presento"/"reagendo"/"perdido", y la probabilidad
// de cierre ya se descarto por subjetiva (ver tablero.ts). Sacarlos del catalogo (no
// dejarlos en null) es la decision: "sin datos" para siempre es peor que no ofrecer el
// widget -- nadie lo puede arreglar agregando data, asi que mantenerlo en la biblioteca
// del Constructor era una promesa falsa.
export type WidgetTipo = 'kpi' | 'tendencia' | 'barras' | 'histograma' | 'lista';
export type WidgetGrupo = 'throughput' | 'velocity' | 'segmentacion' | 'economia' | 'probabilidad';

// Las unicas fuentes que HOY resuelven contra datos reales (ver app/db/repository.ts).
// Si un widget no tiene fuente real, NO entra al catalogo (ver comentario de arriba) --
// no se deja con dataSource: null "por si acaso".
export type DataSourceKey =
  | 'toquesTotal'
  | 'promedioDiario'
  | 'leadsTocados'
  | 'toquesPorCanal'
  | 'toquesPorResultado'
  | 'campanasActivas'
  | 'inscripcionesActivas'
  | 'empresasPorCadencia'
  // Fase 4 (cockpit del CRO, plan-produccion-cro-campana.md): las 3 primeras leen
  // empresa_estado_historial (hoy vacia en produccion -- nada la escribe todavia, ver
  // comentario en actualizarEstadoNotion -- asi que salen "sin datos" hasta que Fase 5
  // cablee las transiciones reales, no es un bug de esta tarea).
  | 'tiempoPromedioPorEtapa' // metrica 1: tiempo en las 3 etapas
  | 'cicloVentaPromedio' // metrica 2: ciclo de venta completo
  | 'velocidadCambioEtapa' // metrica 3: tasa de cambio de stage
  | 'mrrEstimadoTotal' // metrica 4: MRR estimado
  // Conectados 2026-07-22 (auditoria de data confirmada en prod): las 4 fuentes de abajo
  // SI existen. Ver comentarios largos junto a cada funcion en app/db/repository.ts para
  // el detalle de la query y el filtro owner/rango/organizacion.
  | 'dealsNuevosEnRango' // empresa_estado_historial: entra al pipeline (lead/null -> stage real)
  | 'reunionesAgendadasEnRango' // empresa_estado_historial: transiciones a reunion_agendada
  | 'followUpPorDeal' // toque: toques totales / empresas distintas tocadas, mismo rango
  | 'segmentacionPorPersona' // contacto.cargo_categoria: distribucion del comite de compra
  // Borderline resuelto A FAVOR (ver decision larga en app/db/repository.ts, funcion
  // toquesAntesDeCerrarPromedio): la unica señal real de "cerrado" es firma_pago (ya
  // usada por cicloVentaPromedio arriba). No existe señal de "perdido" (ni un resultado
  // de toque tipo 'perdido' ni razon_perdida poblada en prod) -- el widget mide SOLO el
  // lado de "gano", nunca "murio", y eso se documenta en el titulo/comentario, no se
  // inventa la mitad que falta.
  | 'toquesAntesDeCerrarPromedio';

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
  { id: 'deals_nuevos', titulo: 'Deals nuevos', grupo: 'throughput', tipo: 'kpi', dataSource: 'dealsNuevosEnRango', spanDefault: 1 },
  { id: 'reuniones_agendadas', titulo: 'Reuniones agendadas', grupo: 'throughput', tipo: 'kpi', dataSource: 'reunionesAgendadasEnRango', spanDefault: 1 },
  { id: 'toques_total', titulo: 'Toques totales', grupo: 'throughput', tipo: 'kpi', dataSource: 'toquesTotal', spanDefault: 1 },
  { id: 'promedio_diario', titulo: 'Promedio diario', grupo: 'throughput', tipo: 'kpi', dataSource: 'promedioDiario', spanDefault: 1 },
  { id: 'leads_tocados', titulo: 'Leads tocados', grupo: 'throughput', tipo: 'kpi', dataSource: 'leadsTocados', spanDefault: 1 },

  // Velocity / cycle time
  // "Lead → cliente" YA es el ciclo de venta completo del plan (metrica 2): mismo widget
  // del mockup, se le cablea la fuente real en vez de crear uno nuevo con el mismo sentido.
  { id: 'lead_a_cliente', titulo: 'Lead → cliente', grupo: 'velocity', tipo: 'tendencia', dataSource: 'cicloVentaPromedio', spanDefault: 1 },
  { id: 'follow_up_por_deal', titulo: 'Follow-up por deal', grupo: 'velocity', tipo: 'tendencia', dataSource: 'followUpPorDeal', spanDefault: 1 },
  // Titulo sin "/morir" a proposito (ver DataSourceKey.toquesAntesDeCerrarPromedio): la
  // unica señal real es firma_pago (gano), no existe señal de "murio" en la DB hoy.
  { id: 'toques_antes_cerrar', titulo: 'Toques antes de ganar', grupo: 'velocity', tipo: 'tendencia', dataSource: 'toquesAntesDeCerrarPromedio', spanDefault: 1 },
  { id: 'tiempo_en_etapa', titulo: 'Tiempo promedio en etapa (dias)', grupo: 'velocity', tipo: 'barras', dataSource: 'tiempoPromedioPorEtapa', spanDefault: 2 },
  { id: 'velocidad_cambio_etapa', titulo: 'Velocity: cambios de etapa / dia', grupo: 'velocity', tipo: 'kpi', dataSource: 'velocidadCambioEtapa', spanDefault: 1 },

  // Segmentacion
  // Tipo 'barras' (no 'lista'): la distribucion por cargo_categoria es exactamente el
  // mismo shape (Record<categoria, conteo>) que toques_por_canal/toques_por_resultado,
  // que ya tienen su renderer de barras -- 'lista' en Widget.tsx hoy solo cuenta filas de
  // un array, no dibuja nada util para este dato.
  { id: 'segmentacion_persona', titulo: 'Segmentación por persona', grupo: 'segmentacion', tipo: 'barras', dataSource: 'segmentacionPorPersona', spanDefault: 4 },
  { id: 'toques_por_canal', titulo: 'Toques por canal', grupo: 'segmentacion', tipo: 'barras', dataSource: 'toquesPorCanal', spanDefault: 2 },
  { id: 'toques_por_resultado', titulo: 'Toques por resultado', grupo: 'segmentacion', tipo: 'barras', dataSource: 'toquesPorResultado', spanDefault: 2 },

  // Economia del deal
  { id: 'campanas_activas', titulo: 'Campañas activas', grupo: 'economia', tipo: 'kpi', dataSource: 'campanasActivas', spanDefault: 1 },
  { id: 'inscripciones_activas', titulo: 'Inscripciones corriendo', grupo: 'economia', tipo: 'kpi', dataSource: 'inscripcionesActivas', spanDefault: 1 },
  { id: 'mrr_estimado', titulo: 'MRR estimado', grupo: 'economia', tipo: 'kpi', dataSource: 'mrrEstimadoTotal', spanDefault: 2 },

  // Probabilidad de cierre (probabilidad_cierre se elimino del catalogo -- ver comentario
  // arriba; empresas_por_cadencia se queda, el grupo simplemente le quedo chico).
  { id: 'empresas_por_cadencia', titulo: 'Empresas por cadencia', grupo: 'probabilidad', tipo: 'barras', dataSource: 'empresasPorCadencia', spanDefault: 2 },
] as const;

export function widgetPorId(id: string): Widget | undefined {
  return WIDGETS.find((w) => w.id === id);
}
