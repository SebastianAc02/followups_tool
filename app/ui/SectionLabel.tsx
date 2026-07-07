import type { ReactNode } from "react";
import { cx } from "./cx";

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("text-[11px] font-medium uppercase tracking-[0.09em] text-faint", className)}>
      {children}
    </div>
  );
}
