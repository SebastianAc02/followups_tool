// Tarjeta de métrica del home. Calca el "4-card metric strip" del mockup Orquesta:
// número enorme en Archivo Black (font-heading), label en mayúscula, borde que se enciende
// en hover. tone controla color del número + borde; subTone el color del sub.
import { cx } from '../cx';

type Tone = 'neutral' | 'overdue' | 'accent' | 'done';

// Vencidos usa el rojo del mockup (border-red-900/60 -> hover 700/80); el resto enciende violeta.
const CARD_TONE: Record<Tone, string> = {
  neutral: 'border-line-card hover:border-accent',
  overdue: 'border-red-900/60 hover:border-red-700/80',
  accent: 'border-line-card hover:border-accent',
  done: 'border-line-card hover:border-accent',
};

const LABEL_TONE: Record<Tone, string> = {
  neutral: 'text-muted',
  overdue: 'text-red-400',
  accent: 'text-muted',
  done: 'text-muted',
};

const NUM_TONE: Record<Tone, string> = {
  neutral: 'text-ink',
  overdue: 'text-red-400',
  accent: 'text-accent-soft', // deals calientes: violeta (acento de datos)
  done: 'text-ink',
};

const SUB_TONE: Record<'faint' | 'done' | 'overdue', string> = {
  faint: 'text-faint',
  done: 'text-emerald-400',
  overdue: 'text-red-700',
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
    <div className={cx('group rounded-xl border bg-card p-5 transition-colors duration-150', CARD_TONE[tone])}>
      <div className={cx('mb-3 text-xs uppercase tracking-wide', LABEL_TONE[tone])}>{label}</div>
      <div className={cx('mb-2 font-heading text-5xl leading-none tabular-nums md:text-6xl', NUM_TONE[tone])}>
        {valor}
      </div>
      <div className={cx('text-xs', SUB_TONE[subTone])}>{sub}</div>
    </div>
  );
}
