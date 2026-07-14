// Renderer por tipo (kpi/tendencia/barras/histograma/lista). Recibe el widget del
// catalogo + su metrica ya resuelta; si esta en sin_datos, el marco es el mismo pero
// el valor cae a placeholder en muted -- nunca se inventa un numero.
import type { Widget as WidgetDef } from '../../core/panel/widgets';
import type { MetricaValor } from '../../core/panel/metricas';

const SPAN_CLASE: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-3',
  4: 'col-span-2 md:col-span-4',
};

function formatoNumero(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString('es-CO') : n.toFixed(1);
}

function Cuerpo({ widget, metrica }: { widget: WidgetDef; metrica: MetricaValor }) {
  if (metrica.estado === 'sin_datos') {
    return <div className="font-mono text-2xl font-bold text-muted-foreground">sin datos</div>;
  }

  switch (widget.tipo) {
    case 'kpi':
    case 'tendencia':
      return (
        <div className="font-mono text-4xl font-bold leading-none tracking-tight text-foreground">
          {typeof metrica.valor === 'number' ? formatoNumero(metrica.valor) : '—'}
        </div>
      );
    case 'barras': {
      const filas = typeof metrica.valor === 'object' && !Array.isArray(metrica.valor) ? Object.entries(metrica.valor) : [];
      const max = Math.max(1, ...filas.map(([, v]) => v));
      return (
        <ul className="flex flex-col gap-2">
          {filas.map(([label, valor]) => (
            <li key={label} className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0 truncate text-muted-foreground">{label}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${(valor / max) * 100}%` }} />
              </span>
              <span className="mono w-8 shrink-0 text-right text-foreground">{valor}</span>
            </li>
          ))}
        </ul>
      );
    }
    case 'histograma':
    case 'lista':
      return (
        <div className="font-mono text-xs text-muted-foreground">
          {Array.isArray(metrica.valor) ? `${metrica.valor.length} filas` : 'sin datos'}
        </div>
      );
    default:
      return null;
  }
}

export function Widget({
  widget,
  metrica,
  span,
  onQuitar,
}: {
  widget: WidgetDef;
  metrica: MetricaValor;
  span?: number;
  onQuitar?: () => void;
}) {
  return (
    <div
      className={`${SPAN_CLASE[span ?? widget.spanDefault] ?? 'col-span-1'} relative flex flex-col gap-2.5 rounded-2xl border border-border bg-muted p-5 transition-colors hover:border-primary`}
    >
      {onQuitar ? (
        <button
          type="button"
          onClick={onQuitar}
          aria-label={`Quitar ${widget.titulo}`}
          className="absolute right-3 top-3 text-muted-foreground hover:text-destructive"
        >
          ×
        </button>
      ) : null}
      <div className="min-h-6 font-mono text-xs font-semibold uppercase leading-snug tracking-wide text-muted-foreground">
        {widget.titulo}
      </div>
      <Cuerpo widget={widget} metrica={metrica} />
    </div>
  );
}
