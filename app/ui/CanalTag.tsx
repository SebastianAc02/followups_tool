import { cn } from "./cn";
import { canalDot, canalTagText, CANAL_LABEL, type Canal } from "./canal-tag.variants.ts";

export type { Canal } from "./canal-tag.variants.ts";

export function CanalDot({ canal, className }: { canal: Canal; className?: string }) {
  return <span className={cn(canalDot({ canal }), className)} aria-hidden="true" />;
}

export function CanalTag({ canal, className }: { canal: Canal; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <CanalDot canal={canal} />
      <span className={canalTagText({ canal })}>{CANAL_LABEL[canal]}</span>
    </span>
  );
}
