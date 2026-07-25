import { cva } from "class-variance-authority";

// "upcoming" (2026-07-24): lo que tiene fecha pero todavia no llega. Antes solo existian
// overdue y today, asi que un cierre agendado para dentro de tres dias se pintaba en el
// ambar de "hoy" -- el color decia hoy encima de una fecha que no era hoy. Gris de dato
// frio: esta en la lista, no es trabajo de esta jornada.
export type Severity = "overdue" | "today" | "upcoming";

export const severityText = cva("mono text-[12px] font-medium", {
  variants: {
    variant: {
      overdue: "text-overdue",
      today: "text-today",
      upcoming: "text-muted",
    } satisfies Record<Severity, string>,
  },
});
