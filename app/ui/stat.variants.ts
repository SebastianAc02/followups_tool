import { cva } from "class-variance-authority";

export type StatTone = "neutral" | "done" | "overdue";

// Calca los stats del header en Arc (Sales Followup Cockpit): flex-col, valor arriba
// (text-xl md:text-2xl font-bold tabular-nums, sans) y etiqueta uppercase debajo.
export const statValue = cva("text-xl md:text-2xl font-bold leading-none tabular-nums", {
  variants: {
    tone: {
      neutral: "text-ink",
      done: "text-acento",
      overdue: "text-overdue",
    } satisfies Record<StatTone, string>,
  },
  defaultVariants: { tone: "neutral" },
});
