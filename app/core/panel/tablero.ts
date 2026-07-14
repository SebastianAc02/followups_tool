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

const TABLERO_DEFAULT_IDS = ['toques_total', 'promedio_diario', 'leads_tocados', 'toques_por_canal'];

export function tableroDefault(): TableroItem[] {
  return TABLERO_DEFAULT_IDS.filter((id) => widgetPorId(id) !== undefined).map((id) => ({
    widgetId: id,
    span: widgetPorId(id)!.spanDefault,
  }));
}

export function agregar(layout: TableroItem[], widgetId: string): TableroItem[] {
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
// entre versiones y un layout guardado viejo no debe romper el render.
export function parse(json: string): TableroItem[] {
  let crudo: unknown;
  try {
    crudo = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(crudo)) return [];

  const out: TableroItem[] = [];
  for (const item of crudo) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as Record<string, unknown>).widgetId === 'string' &&
      widgetPorId((item as Record<string, unknown>).widgetId as string) !== undefined
    ) {
      const widgetId = (item as { widgetId: string }).widgetId;
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
