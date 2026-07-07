import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";
import { chip } from "./chip.variants.ts";

type ChipProps = { on?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>;

export function Chip({ on, children, className, ...props }: ChipProps) {
  return (
    <button type="button" className={cn(chip({ on }), className)} {...props}>
      {children}
    </button>
  );
}
