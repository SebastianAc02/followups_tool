import { cva } from "class-variance-authority";

export type Severity = "overdue" | "today";

export const severityText = cva("mono text-[12px] font-medium", {
  variants: {
    variant: {
      overdue: "text-overdue",
      today: "text-today",
    } satisfies Record<Severity, string>,
  },
});
