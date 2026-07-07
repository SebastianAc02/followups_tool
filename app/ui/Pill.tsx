import type { ReactNode } from "react";
import { cn } from "./cn";
import { pill, pillDot, type PillTone } from "./pill.variants.ts";

export type { PillTone } from "./pill.variants.ts";
export { pillParaEstado } from "./pill.variants.ts";

export function Pill({
  tone,
  dot,
  children,
  className,
}: {
  tone: PillTone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn(pill(), className)}>
      {dot && <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", pillDot[tone])} aria-hidden="true" />}
      {children}
    </span>
  );
}
