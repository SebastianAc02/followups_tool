import type { ReactNode } from "react";
import { cx } from "./cx";

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("text-xs uppercase tracking-widest text-muted", className)}>
      {children}
    </div>
  );
}
