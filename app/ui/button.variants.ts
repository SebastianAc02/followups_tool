import { cva } from "class-variance-authority";

// "solid"/"ghost" calcan .btn--primary/.btn--ghost de Cockpit (1).html (columna de
// acciones de la barra "Ahora"): ancho fijo, radio 10px, no pill.
export const button = cva("cursor-pointer transition-colors disabled:opacity-55", {
  variants: {
    variant: {
      block: "w-full rounded-[13px] bg-white py-4 text-[15px] font-semibold text-[#0a0a0b] hover:opacity-90",
      pill: "rounded-full bg-white px-[18px] py-2 text-[13px] font-medium text-[#0a0a0b] hover:opacity-90",
      solid: "w-full rounded-[10px] bg-[#eef1f4] px-4 py-[13px] text-[14px] font-bold text-[#14181d] hover:bg-white",
      ghost: "w-full rounded-[10px] border border-[#33333a] bg-transparent px-4 py-[11px] text-[13px] font-semibold text-[#c9c9cd] hover:bg-hover",
    },
  },
  defaultVariants: { variant: "pill" },
});
