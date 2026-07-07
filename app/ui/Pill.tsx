import type { ReactNode } from "react";
import { cn } from "./cn";
import { pill, type PillTone } from "./pill.variants.ts";

export type { PillTone } from "./pill.variants.ts";
export { pillParaEstado } from "./pill.variants.ts";

export function Pill({ tone, children, className }: { tone: PillTone; children: ReactNode; className?: string }) {
  return <span className={cn(pill({ tone }), className)}>{children}</span>;
}
