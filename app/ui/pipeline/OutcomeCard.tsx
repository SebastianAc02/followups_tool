// Tarjeta de resultado del embudo (ganado / on hold): vive fuera de las bandas
// porque no son un paso intermedio, son el desenlace de la cuenta.
import type { ResultadoEmbudo } from '../../core/embudo';
import { cn } from '../cn';

export function OutcomeCard({
  resultado,
  tono,
  onClick,
}: {
  resultado: ResultadoEmbudo;
  tono: 'ganado' | 'onhold';
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded-xl p-4 border text-left',
        tono === 'ganado' ? 'border-check bg-done-bg' : 'border-overdue bg-overdue-bg',
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={cn('w-2 h-2 rounded-full', tono === 'ganado' ? 'bg-check' : 'bg-overdue')} />
        <span className="text-[12px] font-semibold text-ink">{resultado.label}</span>
      </div>
      <div className="flex items-end justify-between">
        <span className="mono text-[36px] leading-none text-ink">{resultado.total}</span>
        {resultado.usuarios !== null && (
          <span className="mono text-[14px] text-muted">{resultado.usuarios.toLocaleString('es-CO')} usuarios</span>
        )}
      </div>
    </button>
  );
}
