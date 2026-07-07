import { cn } from "./cn";
import { statValue, type StatTone } from "./stat.variants.ts";

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
    <div className={cn("flex flex-col gap-1", className)}>
      <span className={statValue({ tone })}>{value}</span>
      <span className="text-[12px] text-muted">{label}</span>
    </div>
  );
}
