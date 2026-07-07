import { cva } from 'class-variance-authority';

export const tabButton = cva(
  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors duration-150',
  {
    variants: {
      active: {
        true: 'bg-surface-2 font-semibold text-ink',
        false: 'text-muted hover:bg-hover hover:text-ink-soft',
      },
    },
    defaultVariants: { active: false },
  },
);
