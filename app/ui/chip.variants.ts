import { cva } from "class-variance-authority";

export const chip = cva("cursor-pointer rounded-full border px-[15px] py-2 text-[12px]", {
  variants: {
    on: {
      true: "border-white bg-white text-[#0a0a0b]",
      false: "border-line-strong bg-surface text-ink-soft",
    },
  },
  defaultVariants: { on: false },
});
