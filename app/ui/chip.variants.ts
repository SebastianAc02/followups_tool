import { cva } from "class-variance-authority";

// tone "invert" = selector tipo switch (owner en DashboardHeader), pill blanco/negro.
// tone "accent" = chip de filtro (AgendaHoy), rectangulo con esquinas suaves y azul
// tenue en estado activo -- calca .chip/.chip.is-active de Cockpit (1).html.
export const chip = cva("inline-flex cursor-pointer items-center gap-2 border transition-colors duration-150", {
  variants: {
    tone: {
      invert: "rounded-full px-[15px] py-2 text-[12px]",
      accent: "rounded-lg px-3 py-1.5 text-xs font-semibold",
    },
    on: {
      true: "",
      false: "",
    },
  },
  compoundVariants: [
    { tone: "invert", on: true, class: "border-white bg-white text-[#0a0a0b]" },
    { tone: "invert", on: false, class: "border-line-strong bg-surface text-ink-soft" },
    { tone: "accent", on: true, class: "border-chip-active-border bg-chip-active-bg text-acento-soft" },
    { tone: "accent", on: false, class: "border-line bg-surface text-ink-soft hover:border-line-strong" },
  ],
  defaultVariants: { on: false, tone: "invert" },
});
