import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";
import { chip } from "./chip.variants.ts";

type ChipProps = { on?: boolean; tone?: "invert" | "accent"; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>;

export function Chip({ on, tone, children, className, ...props }: ChipProps) {
  return (
    <button type="button" className={cn(chip({ on, tone }), className)} {...props}>
      {children}
    </button>
  );
}
