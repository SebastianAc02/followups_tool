import type { ReactNode } from "react";
import { cx } from "./cx";

export function Field({ label, value, missing }: { label: string; value: ReactNode; missing?: boolean }) {
  return (
    <div className={cx("flex items-center justify-between border-b border-line py-3")}>
      <span className={cx("text-muted")}>{label}</span>
      {missing ? (
        <span className={cx("rounded-full bg-overdue-bg px-[11px] py-[3px] text-[12px] font-medium text-overdue")}>{value}</span>
      ) : (
        <span className={cx("font-medium")}>{value}</span>
      )}
    </div>
  );
}
