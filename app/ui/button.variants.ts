import { cva } from "class-variance-authority";

export const button = cva(
  "cursor-pointer bg-white text-[#0a0a0b] transition-opacity hover:opacity-90 disabled:opacity-55",
  {
    variants: {
      variant: {
        block: "w-full rounded-[13px] py-4 text-[15px] font-semibold",
        pill: "rounded-full px-[18px] py-2 text-[13px] font-medium",
      },
    },
    defaultVariants: { variant: "pill" },
  },
);
