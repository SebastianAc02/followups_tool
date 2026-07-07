import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export function Seg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("mb-3.5 inline-flex gap-[3px] rounded-[11px] border border-line bg-surface p-[3px]", className)}>
      {children}
    </div>
  );
}

type SegButtonProps = { on?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>;

export function SegButton({ on, children, className, ...props }: SegButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        "cursor-pointer rounded-lg px-[17px] py-2 text-[13px] font-medium",
        on ? "bg-surface-2 text-ink" : "bg-transparent text-muted",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
