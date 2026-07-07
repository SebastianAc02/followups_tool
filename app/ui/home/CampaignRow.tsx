// Fila de campaña activa con barra de progreso. inscritas/objetivo -> ratio + %.
import { cx } from '../cx';

export type CampaignVM = {
  id: number;
  nombre: string;
  estado: string;
  inscritas: number;
  objetivo: number;
};

export function CampaignRow({ c, primero }: { c: CampaignVM; primero: boolean }) {
  const pct = c.objetivo > 0 ? Math.round((c.inscritas / c.objetivo) * 100) : 0;
  const activa = c.estado === 'activa';

  return (
    <div
      className={cx(
        'group flex cursor-pointer items-center gap-4 px-5 py-4 transition-all duration-150 hover:bg-card-hover',
        primero
          ? 'border-l-2 border-accent'
          : 'border-t border-line-card border-l-2 border-l-transparent hover:border-l-accent',
      )}
    >
      <span
        className={cx(
          'h-2 w-2 flex-none rounded-full',
          activa ? 'bg-emerald-400 shadow-sm' : 'bg-amber-400 shadow-sm',
        )}
      />
      <span className="w-44 truncate text-sm font-medium text-ink">{c.nombre}</span>
      <span
        className={cx(
          'flex-none rounded-full px-2.5 py-0.5 text-xs font-semibold',
          activa ? 'bg-emerald-950/60 text-emerald-400' : 'bg-amber-950/60 text-amber-400',
        )}
      >
        {activa ? 'Activa' : 'Pausada'}
      </span>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div className={cx('h-full rounded-full', activa ? 'bg-accent' : 'bg-accent/50')} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-24 flex-none text-right text-xs text-muted">
        {c.inscritas}/{c.objetivo} · {pct}%
      </span>
    </div>
  );
}
