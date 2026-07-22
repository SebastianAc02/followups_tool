// Modelo puro del tablero (Tarea 7 del plan). Decision de diseno: las operaciones son
// funciones puras sobre un array (agregar/quitar/reordenar devuelven un array nuevo, no
// mutan el que reciben) porque el motor de DnD (dnd-kit) y el server action las llaman
// desde contextos distintos (evento de UI vs persistencia) y ninguno de los dos debe
// preocuparse por mutacion compartida. `parse` es la unica funcion que conoce el
// catalogo (via widgetPorId) -- valida contra el catalogo real, asi un layout guardado
// con un widgetId que despues se borro del catalogo no rompe el render, simplemente
// desaparece del tablero.

import { widgetPorId } from './widgets.ts';

export type TableroItem = { widgetId: string; span: number };

// Default = las 5 metricas del CRO (docs/plan-produccion-cro-campana.md, Fase 4). Decision
// de Sebastian (2026-07-22): el tablero abre con SOLO estas cinco; el resto del catalogo
// sigue disponible por el drag&drop, no se borra. Antes el default traia el catalogo
// completo (~24 widgets), la mayoria "sin datos", y enterraba las cinco que importan.
// Sin probabilidad_cierre: decision de Sebastian (2026-07-22). La probabilidad de cierre
// depende del proceso del CLIENTE (que haya agreement de su lado), no del proceso propio;
// forzar un numero seria subjetivo. Se deja fuera hasta que exista una senal objetiva.
const DEFAULT_IDS = [
  'tiempo_en_etapa', // tiempo promedio en las 3 stages (cuanto dura cada etapa)
  'lead_a_cliente', // ciclo de venta (cuanto tarda un cierre)
  'velocidad_cambio_etapa', // tasa de cambio de stage
  'mrr_estimado', // revenue estimado (0 hasta configurar tarifa del plan)
] as const;

export function tableroDefault(): TableroItem[] {
  return DEFAULT_IDS.map((id) => {
    const w = widgetPorId(id);
    return { widgetId: id, span: w?.spanDefault ?? 1 };
  });
}

// Invariante: un widgetId no se repite en el tablero (un usuario no puede tener "Toques
// totales" dos veces). Si ya esta, agregar() es un no-op -- la UI usa esto para saber que
// deshabilitar, no hay forma de forzar el duplicado desde afuera del core.
export function agregar(layout: TableroItem[], widgetId: string): TableroItem[] {
  if (layout.some((i) => i.widgetId === widgetId)) return layout;
  const widget = widgetPorId(widgetId);
  const span = widget?.spanDefault ?? 1;
  return [...layout, { widgetId, span }];
}

export function quitar(layout: TableroItem[], idx: number): TableroItem[] {
  return layout.filter((_, i) => i !== idx);
}

export function reordenar(layout: TableroItem[], from: number, to: number): TableroItem[] {
  if (from < 0 || from >= layout.length || to < 0 || to >= layout.length) return layout;
  const copia = [...layout];
  const [item] = copia.splice(from, 1);
  copia.splice(to, 0, item);
  return copia;
}

// Descarta widgetIds que ya no existen en WIDGETS -- un catalogo puede perder widgets
// entre versiones y un layout guardado viejo no debe romper el render. Tambien descarta
// repetidos (se pudo haber guardado un duplicado antes de que agregar() lo bloqueara):
// el layout persistido se auto-repara al proximo load, no hace falta migracion.
export function parse(json: string): TableroItem[] {
  let crudo: unknown;
  try {
    crudo = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(crudo)) return [];

  const vistos = new Set<string>();
  const out: TableroItem[] = [];
  for (const item of crudo) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as Record<string, unknown>).widgetId === 'string' &&
      widgetPorId((item as Record<string, unknown>).widgetId as string) !== undefined
    ) {
      const widgetId = (item as { widgetId: string }).widgetId;
      if (vistos.has(widgetId)) continue;
      vistos.add(widgetId);
      const spanCrudo = (item as { span?: unknown }).span;
      const span = typeof spanCrudo === 'number' && spanCrudo > 0 ? spanCrudo : widgetPorId(widgetId)!.spanDefault;
      out.push({ widgetId, span });
    }
  }
  return out;
}

export function serialize(layout: TableroItem[]): string {
  return JSON.stringify(layout);
}
