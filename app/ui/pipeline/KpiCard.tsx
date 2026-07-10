// Tarjeta individual de KPI en la fila de métricas principales
import { cn } from '../cn';

export type KpiTone = 'primary' | 'success' | 'warning' | 'neutral' | 'error';

const toneStyles: Record<KpiTone, { dot: string; valueColor: string; hoverBorder: string }> = {
  primary: {
    dot: 'bg-blue-400',
    valueColor: 'text-ink',
    hoverBorder: 'hover:border-blue-500/30',
  },
  success: {
    dot: 'bg-green-400',
    valueColor: 'text-ink',
    hoverBorder: 'hover:border-green-500/30',
  },
  warning: {
    dot: 'bg-yellow-400',
    valueColor: 'text-yellow-300',
    hoverBorder: 'hover:border-yellow-500/30',
  },
  neutral: {
    dot: 'bg-slate-500',
    valueColor: 'text-ink',
    hoverBorder: 'hover:border-slate-400/30',
  },
  error: {
    dot: 'bg-red-400',
    valueColor: 'text-ink',
    hoverBorder: 'hover:border-red-500/30',
  },
};

export function KpiCard({
  label,
  value,
  tone = 'primary',
  className,
}: {
  label: string;
  value: number | string;
  tone?: KpiTone;
  className?: string;
}) {
  const styles = toneStyles[tone];

  return (
    <div
      className={cn(
        'bg-pipeline-card border border-line-card rounded-xl px-3.5 py-2.5 flex flex-col gap-1.5',
        'transition-all duration-150 hover:shadow-md cursor-default',
        styles.hoverBorder,
        className
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn('w-2 h-2 rounded-sm flex-shrink-0', styles.dot)} aria-hidden="true" />
        <span className="text-xs text-muted font-medium leading-none">{label}</span>
      </div>
      <div className={cn('font-serif text-2xl font-semibold tracking-tight tabular-nums leading-none', styles.valueColor)}>
        {value}
      </div>
    </div>
  );
}
