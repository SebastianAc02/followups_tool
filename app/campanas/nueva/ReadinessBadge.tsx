import { cn } from '../../ui/cn';

const TONO = {
  lista: 'bg-done/15 text-done',
  parcial: 'bg-warn/15 text-warn',
  sin_canal: 'bg-surface-2 text-muted',
} as const;

const LABEL = { lista: 'lista', parcial: 'parcial', sin_canal: 'sin canal' } as const;

type Props = { estado: keyof typeof TONO; pasosSinCanal?: number[] };

export function ReadinessBadge({ estado, pasosSinCanal }: Props) {
  return (
    <span
      className={cn('rounded-full px-[9px] py-0.5 text-[11px] font-medium', TONO[estado])}
      title={pasosSinCanal && pasosSinCanal.length > 0 ? `Sin canal para el paso ${pasosSinCanal.join(', ')}` : undefined}
    >
      {LABEL[estado]}
    </span>
  );
}
