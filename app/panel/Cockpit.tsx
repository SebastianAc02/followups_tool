// Vista de lectura (port de #executive-cockpit, index.html:148-1147). Se porta el look
// (barra de filtros, secciones por grupo, grid de KPIs) pero cada widget dibuja SOLO el
// dato real que ya viene resuelto en `metricas`; sin fuente -> "sin datos" (Decision 1
// del plan). El cableado real de los filtros (owner/fecha) es la Tarea 14.
import type { TableroItem } from '../core/panel/tablero';
import type { MetricaValor } from '../core/panel/metricas';
import { WIDGETS, type WidgetGrupo } from '../core/panel/widgets';
import { Widget } from './widgets/Widget';

const GRUPO_LABEL: Record<WidgetGrupo, string> = {
  throughput: 'Throughput del periodo',
  velocity: 'Velocity / cycle time',
  segmentacion: 'Segmentación',
  economia: 'Economía del deal',
  probabilidad: 'Probabilidad de cierre',
};

const ORDEN_GRUPOS: WidgetGrupo[] = ['throughput', 'velocity', 'segmentacion', 'economia', 'probabilidad'];

export function Cockpit({ tablero, metricas }: { tablero: TableroItem[]; metricas: Record<string, MetricaValor> }) {
  const idsEnTablero = new Set(tablero.map((t) => t.widgetId));
  const spanPorId = new Map(tablero.map((t) => [t.widgetId, t.span]));

  return (
    <div className="flex flex-col gap-8">
      {/* Barra de filtros: visual en v1 (Tarea 14 cablea owner/fecha reales) */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted px-5 py-4">
        <span className="rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-xs font-bold tracking-wider text-primary">
          Pregunta
        </span>
        <input
          type="text"
          disabled
          placeholder="Próximamente: pregunta libre vía MCP..."
          className="min-w-0 flex-1 border-none bg-transparent font-body text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <span className="rounded-full border border-border bg-card px-3 py-1.5 font-body text-xs text-muted-foreground">
          Todos los owners
        </span>
      </div>

      {ORDEN_GRUPOS.map((grupo) => {
        const widgetsDelGrupo = WIDGETS.filter((w) => w.grupo === grupo && idsEnTablero.has(w.id));
        if (widgetsDelGrupo.length === 0) return null;
        return (
          <section key={grupo} aria-label={GRUPO_LABEL[grupo]}>
            <div className="mb-4 font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {GRUPO_LABEL[grupo]}
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {widgetsDelGrupo.map((w) => (
                <Widget key={w.id} widget={w} metrica={metricas[w.id] ?? { estado: 'sin_datos' }} span={spanPorId.get(w.id)} />
              ))}
            </div>
          </section>
        );
      })}

      {tablero.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Tu tablero está vacío. Ve a Constructor para armarlo.
        </div>
      ) : null}
    </div>
  );
}
