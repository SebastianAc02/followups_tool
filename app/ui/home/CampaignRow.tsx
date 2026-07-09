// Fila de campaña activa con barra de progreso. toquesHechos/toquesEsperados -> ratio
// + %: cuanto de la cadencia YA se resolvio (enviado u omitido), no cuantos leads
// consiguieron destinatario -- eso era el bug real (inscritas/objetivo daba 100% con
// 0 toques hechos, en cuanto ningun lead quedaba bloqueado).
import { cx } from '../cx';

export type CampaignVM = {
  id: number;
  nombre: string;
  estado: string;
  toquesHechos: number;
  toquesEsperados: number;
};

export function CampaignRow({ c, primero }: { c: CampaignVM; primero: boolean }) {
  const pct = c.toquesEsperados > 0 ? Math.round((c.toquesHechos / c.toquesEsperados) * 100) : 0;
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
      <span className={cx('h-2 w-2 flex-none rounded-full shadow-sm', activa ? 'bg-done' : 'bg-today')} />
      <span className="w-44 truncate text-sm font-medium text-ink">{c.nombre}</span>
      <span
        className={cx(
          'flex-none rounded-full px-2.5 py-0.5 text-xs font-semibold',
          activa ? 'bg-done/10 text-done' : 'bg-today/10 text-today',
        )}
      >
        {activa ? 'Activa' : 'Pausada'}
      </span>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div className={cx('h-full rounded-full', activa ? 'bg-accent' : 'bg-accent/50')} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-28 flex-none text-right text-xs text-muted">
        {c.toquesHechos}/{c.toquesEsperados} toques · {pct}%
      </span>
    </div>
  );
}
