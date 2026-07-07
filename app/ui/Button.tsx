import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

const VARIANT = {
  block: "w-full rounded-[13px] py-4 text-[15px] font-semibold",
  pill: "rounded-full px-[18px] py-2 text-[13px] font-medium",
} as const;

type ButtonProps = { variant?: keyof typeof VARIANT } & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ variant = "pill", className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        "cursor-pointer bg-white text-[#0a0a0b] transition-opacity hover:opacity-90 disabled:opacity-55",
        VARIANT[variant],
        className,
      )}
      {...props}
    />
  );
}
