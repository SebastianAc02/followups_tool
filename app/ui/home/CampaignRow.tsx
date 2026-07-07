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
        'flex cursor-pointer items-center gap-4 px-5 py-[15px] hover:bg-card-hover',
        !primero && 'border-t border-line-card',
      )}
    >
      <span
        className={cx(
          'h-2 w-2 flex-none rounded-full',
          activa ? 'bg-done shadow-[0_0_8px_rgba(87,201,138,0.5)]' : 'bg-today shadow-[0_0_8px_rgba(242,183,56,0.5)]',
        )}
      />
      <span className="w-[190px] text-[14px] font-medium text-ink">{c.nombre}</span>
      <span
        className={cx(
          'rounded-full px-[9px] py-0.5 text-[11px] font-semibold',
          activa ? 'bg-done/10 text-done' : 'bg-today/10 text-today',
        )}
      >
        {activa ? 'Activa' : 'Pausada'}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded bg-surface-2">
        <div className="h-full rounded bg-gradient-to-r from-[#6d5ce0] to-accent-soft" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-24 text-right text-[12.5px] text-muted">
        {c.inscritas}/{c.objetivo} · {pct}%
      </span>
    </div>
  );
}
