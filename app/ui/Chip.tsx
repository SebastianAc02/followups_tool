import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

type ChipProps = { on?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>;

export function Chip({ on, children, className, ...props }: ChipProps) {
  return (
    <button
      type="button"
      className={cx(
        "cursor-pointer rounded-full border px-[15px] py-2 text-[12px]",
        on ? "border-white bg-white text-[#0a0a0b]" : "border-line-strong bg-surface text-ink-soft",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
