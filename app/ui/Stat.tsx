import { cn } from "./cn";
import { statValue, type StatTone } from "./stat.variants.ts";

// Calca el bloque de stat del header en Arc (Sales Followup Cockpit):
// flex-col items-start md:items-end gap-0.5, valor arriba, label caption abajo.
export function Stat({
  value,
  label,
  tone = "neutral",
  className,
}: {
  value: number | string;
  label: string;
  tone?: StatTone;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-0.5 md:items-end", className)}>
      <span className={statValue({ tone })}>{value}</span>
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
    </div>
  );
}
