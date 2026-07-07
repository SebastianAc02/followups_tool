import type { ReactNode } from "react";
import { cx } from "./cx";

const TONE = {
  hot: "bg-today-bg text-today",
  warm: "bg-surface-2 text-ink-soft",
  cold: "bg-surface-2 text-muted",
} as const;

export function Pill({ tone, children }: { tone: keyof typeof TONE; children: ReactNode }) {
  return (
    <span className={cx("rounded-[7px] px-[9px] py-0.5 text-[11px] font-medium", TONE[tone])}>
      {children}
    </span>
  );
}
