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
import { WIDGETS } from '../core/panel/widgets';
import { Widget } from './widgets/Widget';

function navegarConFiltro(router: ReturnType<typeof useRouter>, cambios: Record<string, string | undefined>, actuales: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  const combinado = { ...actuales, ...cambios };
  for (const [k, v] of Object.entries(combinado)) if (v) params.set(k, v);
  router.push(`/panel?${params.toString()}`);
}

// Los atajos de rango. Existen porque la pregunta que mas se hace es "que llevo HOY" y ponerla
// exigia escribir la misma fecha en dos calendarios, que es suficiente friccion para que nadie mire
// el panel a media tarde.
//
// El dia base entra por PROP desde el servidor, no de `new Date()` del navegador: la app tiene un
// reloj de demo por request (app/lib/reloj.ts) que corre la fecha en modo prueba, y un preset
// calculado en el cliente apuntaria al dia de verdad mientras el resto de la pantalla muestra el
// simulado. Es el mismo error que ya se corrigio en las tandas.
function diaRelativo(base: string, dias: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function presetsDeRango(hoy: string): { etiqueta: string; desde: string; hasta: string }[] {
  return [
    { etiqueta: 'Hoy', desde: hoy, hasta: hoy },
    { etiqueta: 'Ayer', desde: diaRelativo(hoy, -1), hasta: diaRelativo(hoy, -1) },
    { etiqueta: '7 días', desde: diaRelativo(hoy, -6), hasta: hoy },
    { etiqueta: '30 días', desde: diaRelativo(hoy, -29), hasta: hoy },
  ];
}

export function Cockpit({
  tablero,
  metricas,
  owner,
  owners,
  desde,
  hasta,
  hoy,
}: {
  tablero: TableroItem[];
  metricas: Record<string, MetricaValor>;
  owner?: string;
  owners: string[];
  desde: string;
  hasta: string;
  hoy: string;
}) {
  const router = useRouter();
  const actuales = { owner, desde, hasta };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-5 py-4">
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

        {presetsDeRango(hoy).map((p) => {
          const activo = desde === p.desde && hasta === p.hasta;
          return (
            <button
              key={p.etiqueta}
              type="button"
              aria-pressed={activo}
              onClick={() => navegarConFiltro(router, { desde: p.desde, hasta: p.hasta }, actuales)}
              className={
                activo
                  ? 'rounded-full border border-primary bg-primary/10 px-3 py-1.5 font-body text-xs font-semibold text-primary'
                  : 'rounded-full border border-border bg-card px-3 py-1.5 font-body text-xs text-muted-foreground hover:text-foreground'
              }
            >
              {p.etiqueta}
            </button>
          );
        })}

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

      {/* Se renderiza en el ORDEN del tablero (drag & drop), no reagrupado por categoria
          (Sebastian 2026-07-22): antes el cockpit agrupaba por grupo e ignoraba el orden de
          la edicion, asi un widget que arrastrabas abajo salia arriba en el cockpit. Ahora
          cockpit y edicion muestran lo mismo, en el mismo orden. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tablero.map((item) => {
          const w = WIDGETS.find((x) => x.id === item.widgetId);
          if (!w) return null;
          return <Widget key={w.id} widget={w} metrica={metricas[w.id] ?? { estado: 'sin_datos' }} span={item.span} />;
        })}
      </div>

      {tablero.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Tu tablero está vacío. Dale a &quot;Editar&quot; para armarlo.
        </div>
      ) : null}
    </div>
  );
}
