// Tarjeta de métrica del home. tone controla el color del número y del borde.
import { cx } from '../cx';

type Tone = 'neutral' | 'overdue' | 'accent' | 'done';

const NUM_TONE: Record<Tone, string> = {
  neutral: 'text-ink',
  overdue: 'text-overdue',
  accent: 'text-accent-soft',
  done: 'text-ink',
};

const BORDER_TONE: Record<Tone, string> = {
  neutral: 'border-line-card',
  overdue: 'border-[#2a1618]',
  accent: 'border-line-card',
  done: 'border-line-card',
};

export function StatCard({
  label,
  valor,
  sub,
  tone = 'neutral',
  subTone = 'faint',
}: {
  label: string;
  valor: number | string;
  sub: string;
  tone?: Tone;
  subTone?: 'faint' | 'done' | 'overdue';
}) {
  return (
    <div className={cx('rounded-[15px] border bg-card px-5 py-[18px]', BORDER_TONE[tone])}>
      <div className={cx('mb-3 text-[12px]', tone === 'overdue' ? 'text-overdue' : 'text-muted')}>{label}</div>
      <div className={cx('text-[38px] font-extrabold leading-none tracking-[-0.02em]', NUM_TONE[tone])}>{valor}</div>
      <div
        className={cx(
          'mt-2 text-[11.5px]',
          subTone === 'done' ? 'text-done' : subTone === 'overdue' ? 'text-[#8a5c5f]' : 'text-faint',
        )}
      >
        {sub}
      </div>
    </div>
  );
}
