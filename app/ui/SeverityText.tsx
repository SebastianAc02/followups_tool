import type { ReactNode } from "react";
import { cn } from "./cn";
import { severityText, type Severity } from "./severity-text.variants.ts";

export type { Severity } from "./severity-text.variants.ts";

export function SeverityText({
  variant,
  children,
  className,
}: {
  variant: Severity;
  children: ReactNode;
  className?: string;
}) {
  return <span className={cn(severityText({ variant }), className)}>{children}</span>;
}
