'use client';

// Vista de lectura (port de #executive-cockpit, index.html:148-1147). Se porta el look
// (barra de filtros, secciones por grupo, grid de KPIs) pero cada widget dibuja SOLO el
// dato real que ya viene resuelto en `metricas`; sin fuente -> "sin datos" (Decision 1
// del plan). Tarea 14: owner y fecha son filtros reales -- cambiar cualquiera navega a
// /panel?owner=...&desde=...&hasta=... y el server component re-resuelve las metricas
// contra ese filtro (ver page.tsx). stage/segmento/monto no tienen fuente hoy: quedan
// chips deshabilitados ("próximamente"), tal como pide el plan en vez de inventar dato.
import { useRouter } from 'next/navigation';
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

function navegarConFiltro(router: ReturnType<typeof useRouter>, cambios: Record<string, string | undefined>, actuales: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  const combinado = { ...actuales, ...cambios };
  for (const [k, v] of Object.entries(combinado)) if (v) params.set(k, v);
  router.push(`/panel?${params.toString()}`);
}

export function Cockpit({
  tablero,
  metricas,
  owner,
  owners,
  desde,
  hasta,
}: {
  tablero: TableroItem[];
  metricas: Record<string, MetricaValor>;
  owner?: string;
  owners: string[];
  desde: string;
  hasta: string;
}) {
  const router = useRouter();
  const idsEnTablero = new Set(tablero.map((t) => t.widgetId));
  const spanPorId = new Map(tablero.map((t) => [t.widgetId, t.span]));
  const actuales = { owner, desde, hasta };

  return (
    <div className="flex flex-col gap-8">
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

        <select
          aria-label="Filtrar por owner"
          value={owner ?? ''}
          onChange={(e) => navegarConFiltro(router, { owner: e.target.value || undefined }, actuales)}
          className="rounded-full border border-border bg-card px-3 py-1.5 font-body text-xs text-muted-foreground"
        >
          <option value="">Todos los owners</option>
          {owners.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>

        <input
          type="date"
          aria-label="Desde"
          value={desde}
          onChange={(e) => navegarConFiltro(router, { desde: e.target.value }, actuales)}
          className="rounded-full border border-border bg-card px-3 py-1.5 font-body text-xs text-muted-foreground"
        />
        <input
          type="date"
          aria-label="Hasta"
          value={hasta}
          onChange={(e) => navegarConFiltro(router, { hasta: e.target.value }, actuales)}
          className="rounded-full border border-border bg-card px-3 py-1.5 font-body text-xs text-muted-foreground"
        />

        {['Stage', 'Segmento', 'Monto'].map((chip) => (
          <span
            key={chip}
            aria-disabled="true"
            title="Próximamente: sin fuente de dato hoy"
            className="cursor-not-allowed rounded-full border border-border bg-card px-3 py-1.5 font-body text-xs text-muted-foreground/50"
          >
            {chip} · próximamente
          </span>
        ))}
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
