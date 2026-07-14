'use client';

// Constructor ("Arma tu tablero"): biblioteca de metricas (izquierda) + lienzo (derecha).
// Tarea 11: estatico (agregar/quitar/cargar ejemplo/limpiar, sin DnD). Tarea 12 envuelve
// esto en <DndContext> para drag & drop real. Tarea 13: el grid de abajo YA usa
// `grid grid-cols-1 lg:grid-cols-4` con `lg:col-span-1` / `lg:col-span-3 min-w-0` desde
// el principio (nunca se mezcla flex-1 con el grid de columnas -- la causa raiz que el
// changelog del mockup documenta en 3 intentos fallidos).
import { useState } from 'react';
import type { TableroItem } from '../core/panel/tablero';
import { agregar, quitar, tableroDefault } from '../core/panel/tablero';
import type { MetricaValor } from '../core/panel/metricas';
import { WIDGETS, type WidgetGrupo } from '../core/panel/widgets';
import { Widget } from './widgets/Widget';
import { guardarTablero } from './actions';

const GRUPO_LABEL: Record<WidgetGrupo, string> = {
  throughput: 'Throughput',
  velocity: 'Velocity',
  segmentacion: 'Segmentación',
  economia: 'Economía',
  probabilidad: 'Probabilidad',
};

const ORDEN_GRUPOS: WidgetGrupo[] = ['throughput', 'velocity', 'segmentacion', 'economia', 'probabilidad'];

let debounceHandle: ReturnType<typeof setTimeout> | undefined;
function guardarConDebounce(layout: TableroItem[]) {
  if (debounceHandle) clearTimeout(debounceHandle);
  debounceHandle = setTimeout(() => {
    void guardarTablero(layout);
  }, 500);
}

export function Constructor({
  tableroInicial,
  metricas,
}: {
  tableroInicial: TableroItem[];
  metricas: Record<string, MetricaValor>;
}) {
  const [layout, setLayout] = useState<TableroItem[]>(tableroInicial);

  function actualizar(next: TableroItem[]) {
    setLayout(next); // optimista: la UI no espera al server
    guardarConDebounce(next);
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-4">
      {/* Biblioteca */}
      <aside className="sticky top-4 flex flex-col gap-5 lg:col-span-1">
        {ORDEN_GRUPOS.map((grupo) => (
          <div key={grupo}>
            <div className="mb-2 font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {GRUPO_LABEL[grupo]}
            </div>
            <div className="flex flex-col gap-2">
              {WIDGETS.filter((w) => w.grupo === grupo).map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => actualizar(agregar(layout, w.id))}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted px-3 py-2 text-left text-xs text-foreground transition-colors hover:border-primary hover:bg-card"
                >
                  <span className="truncate">{w.titulo}</span>
                  <span aria-hidden="true" className="text-muted-foreground">+</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </aside>

      {/* Lienzo */}
      <div className="min-w-0 lg:col-span-3">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted px-4 py-3">
          <span className="font-mono text-xs font-bold uppercase tracking-widest text-foreground">
            Mi tablero · {layout.length} widgets
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => actualizar(tableroDefault())}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Cargar ejemplo
            </button>
            <button
              type="button"
              onClick={() => actualizar([])}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-destructive"
            >
              Limpiar
            </button>
          </div>
        </div>

        {layout.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Arrastra o toca una métrica de la biblioteca para agregarla.
          </div>
        ) : (
          <div className="grid auto-rows-min grid-cols-2 gap-3 md:grid-cols-4">
            {layout.map((item, idx) => {
              const widget = WIDGETS.find((w) => w.id === item.widgetId);
              if (!widget) return null;
              return (
                <Widget
                  key={`${item.widgetId}-${idx}`}
                  widget={widget}
                  metrica={metricas[widget.id] ?? { estado: 'sin_datos' }}
                  span={item.span}
                  onQuitar={() => actualizar(quitar(layout, idx))}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
