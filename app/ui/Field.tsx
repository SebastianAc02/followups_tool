import type { ReactNode } from "react";

export function Field({ label, value, missing }: { label: string; value: ReactNode; missing?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-3">
      <span className="text-muted">{label}</span>
      {missing ? (
        <span className="rounded-full bg-overdue-bg px-[11px] py-[3px] text-[12px] font-medium text-overdue">{value}</span>
      ) : (
        <span className="font-medium">{value}</span>
      )}
    </div>
  );
}
