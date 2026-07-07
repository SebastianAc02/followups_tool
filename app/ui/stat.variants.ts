import { cva } from "class-variance-authority";

export type StatTone = "neutral" | "done" | "overdue";

export const statValue = cva("mono text-2xl font-semibold leading-none", {
  variants: {
    tone: {
      neutral: "text-ink",
      done: "text-acento",
      overdue: "text-overdue",
    } satisfies Record<StatTone, string>,
  },
  defaultVariants: { tone: "neutral" },
});
