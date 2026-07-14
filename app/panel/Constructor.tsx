'use client';

// Constructor ("Arma tu tablero"): biblioteca de metricas (izquierda) + lienzo (derecha).
// Tarea 13 (layout): grid `grid-cols-1 lg:grid-cols-4`, biblioteca `lg:col-span-1` (sin
// ancho fijo), lienzo `lg:col-span-3 min-w-0` -- NUNCA `flex-1` mezclado con el grid de
// columnas (causa raiz de los 3 intentos fallidos que registra el changelog del mockup).
// Tarea 12 (DnD): dnd-kit. Biblioteca = draggables sueltos (useDraggable, id prefijado
// `lib:`); lienzo = <SortableContext> de los widgetIds del tablero. `onDragEnd` decide
// por el prefijo del id de origen: viene de la biblioteca -> agregar al final; viene del
// lienzo -> reordenar. Cada cambio de layout es optimista y persiste con debounce de
// 500ms via el server action `guardarTablero`. El estado del layout vive en PanelClient
// (no aca) -- Constructor y Cockpit deben ver el mismo tablero sin recargar la pagina al
// cambiar de modo, si no un widget que quitas en Editar sigue apareciendo en Cockpit.
import {
  DndContext,
  closestCenter,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TableroItem } from '../core/panel/tablero';
import { agregar, quitar, reordenar, tableroDefault } from '../core/panel/tablero';
import type { MetricaValor } from '../core/panel/metricas';
import { WIDGETS, type Widget as WidgetDef, type WidgetGrupo } from '../core/panel/widgets';
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

const PREFIJO_BIBLIOTECA = 'lib:';

let debounceHandle: ReturnType<typeof setTimeout> | undefined;
function guardarConDebounce(layout: TableroItem[]) {
  if (debounceHandle) clearTimeout(debounceHandle);
  debounceHandle = setTimeout(() => {
    void guardarTablero(layout);
  }, 500);
}

function TarjetaBiblioteca({
  widget,
  yaAgregado,
  onAgregar,
}: {
  widget: WidgetDef;
  yaAgregado: boolean;
  onAgregar: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${PREFIJO_BIBLIOTECA}${widget.id}`,
    disabled: yaAgregado,
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      disabled={yaAgregado}
      onClick={yaAgregado ? undefined : onAgregar}
      {...(yaAgregado ? {} : listeners)}
      {...(yaAgregado ? {} : attributes)}
      title={yaAgregado ? 'Ya esta en tu tablero' : undefined}
      className={`flex items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-xs transition-colors ${
        yaAgregado
          ? 'cursor-not-allowed bg-transparent text-muted-foreground/60'
          : `cursor-grab bg-card text-foreground hover:border-primary hover:bg-card-hover active:cursor-grabbing ${isDragging ? 'opacity-40' : ''}`
      }`}
    >
      <span className="truncate">{widget.titulo}</span>
      <span aria-hidden="true" className={yaAgregado ? 'text-muted-foreground/60' : 'text-muted-foreground'}>
        {yaAgregado ? '✓ en tu tablero' : '+'}
      </span>
    </button>
  );
}

function WidgetOrdenable({
  item,
  widget,
  metrica,
  onQuitar,
}: {
  item: TableroItem;
  widget: WidgetDef;
  metrica: MetricaValor;
  onQuitar: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.widgetId });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
      <Widget widget={widget} metrica={metrica} span={item.span} onQuitar={onQuitar} />
    </div>
  );
}

function LienzoVacio() {
  // Droppable propio SOLO para el estado vacio: sin widgets no hay tarjetas sortable que
  // sirvan de blanco de drop, asi que este es el unico droppable en pantalla.
  const { setNodeRef } = useDroppable({ id: 'lienzo' });
  return (
    <div ref={setNodeRef} className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
      Arrastra o toca una métrica de la biblioteca para agregarla.
    </div>
  );
}

function Lienzo({
  layout,
  metricas,
  onQuitar,
}: {
  layout: TableroItem[];
  metricas: Record<string, MetricaValor>;
  onQuitar: (idx: number) => void;
}) {
  if (layout.length === 0) return <LienzoVacio />;

  // Sin droppable propio en el contenedor a proposito: cada tarjeta (useSortable) ya es
  // su propio droppable. Un droppable extra del tamaño de toda la grilla compite con las
  // tarjetas por la colision y a veces gana (el "over" resuelve al contenedor, no a la
  // tarjeta), lo que dejaba `findIndex` en -1 y el reordenar() se saltaba en silencio --
  // causa raiz del bug "se mueve pero no se guarda" que reporto Sebastian.
  return (
    <div className="grid auto-rows-min grid-cols-2 gap-3 md:grid-cols-4">
      <SortableContext items={layout.map((i) => i.widgetId)} strategy={rectSortingStrategy}>
        {layout.map((item, idx) => {
          const widget = WIDGETS.find((w) => w.id === item.widgetId);
          if (!widget) return null;
          return (
            <WidgetOrdenable
              key={item.widgetId}
              item={item}
              widget={widget}
              metrica={metricas[widget.id] ?? { estado: 'sin_datos' }}
              onQuitar={() => onQuitar(idx)}
            />
          );
        })}
      </SortableContext>
    </div>
  );
}

export function Constructor({
  layout,
  onLayoutChange,
  metricas,
}: {
  layout: TableroItem[];
  onLayoutChange: (layout: TableroItem[]) => void;
  metricas: Record<string, MetricaValor>;
}) {
  function actualizar(next: TableroItem[]) {
    onLayoutChange(next); // optimista, y sube al estado compartido con Cockpit -- ver PanelClient
    guardarConDebounce(next);
  }

  // El cursor "grabbing" de Tailwind (:active) solo aplica mientras el puntero esta
  // sobre el elemento que empezo el drag -- en cuanto se mueve rapido y el layout
  // reacomoda debajo, el cursor vuelve a la flecha aunque el drag siga activo. Se fuerza
  // a nivel de documento durante todo el gesto para que se sienta como "agarrado" en
  // cualquier parte de la pantalla, no solo sobre la tarjeta original.
  function onDragStart() {
    document.body.style.cursor = 'grabbing';
  }

  function onDragCancel() {
    document.body.style.cursor = '';
  }

  function onDragEnd(event: DragEndEvent) {
    document.body.style.cursor = '';
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    if (activeId.startsWith(PREFIJO_BIBLIOTECA)) {
      const widgetId = activeId.slice(PREFIJO_BIBLIOTECA.length);
      actualizar(agregar(layout, widgetId));
      return;
    }

    const overId = String(over.id);
    if (overId === activeId) return;
    const from = layout.findIndex((i) => i.widgetId === activeId);
    const to = layout.findIndex((i) => i.widgetId === overId);
    if (from === -1 || to === -1) return;
    actualizar(reordenar(layout, from, to));
  }

  const idsEnLayout = new Set(layout.map((i) => i.widgetId));

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-4">
        {/* Biblioteca */}
        <aside className="sticky top-4 flex max-h-[calc(100vh-8rem)] flex-col gap-5 overflow-y-auto lg:col-span-1">
          {ORDEN_GRUPOS.map((grupo) => (
            <div key={grupo}>
              <div className="mb-2 font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {GRUPO_LABEL[grupo]}
              </div>
              <div className="flex flex-col gap-2">
                {WIDGETS.filter((w) => w.grupo === grupo).map((w) => (
                  <TarjetaBiblioteca
                    key={w.id}
                    widget={w}
                    yaAgregado={idsEnLayout.has(w.id)}
                    onAgregar={() => actualizar(agregar(layout, w.id))}
                  />
                ))}
              </div>
            </div>
          ))}
        </aside>

        {/* Lienzo */}
        <div className="min-w-0 lg:col-span-3">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3">
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

          <Lienzo layout={layout} metricas={metricas} onQuitar={(idx) => actualizar(quitar(layout, idx))} />
        </div>
      </div>
    </DndContext>
  );
}
