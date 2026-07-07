import { cx } from "./cx";

const SEV = {
  overdue: "bg-overdue",
  today: "bg-today",
} as const;

export function Dot({ sev }: { sev: keyof typeof SEV }) {
  return <span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", SEV[sev])} aria-hidden="true" />;
}
