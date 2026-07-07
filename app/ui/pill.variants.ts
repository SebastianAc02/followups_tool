import { cva } from "class-variance-authority";

export type PillTone = "hot" | "warm" | "cold";

export const pill = cva("rounded-[7px] px-[9px] py-0.5 text-[11px] font-medium", {
  variants: {
    tone: {
      hot: "bg-today-bg text-today",
      warm: "bg-surface-2 text-ink-soft",
      cold: "bg-surface-2 text-muted",
    } satisfies Record<PillTone, string>,
  },
});

const ESTADO_PILL: Record<string, { label: string; tone: PillTone }> = {
  reunion_agendada: { label: "reunión", tone: "hot" },
  oportunidad: { label: "oportunidad", tone: "hot" },
  cierre_documentacion: { label: "cierre", tone: "hot" },
  enviar_contrato: { label: "contrato", tone: "hot" },
  contacto_iniciado: { label: "contactado", tone: "warm" },
  lead: { label: "lead", tone: "warm" },
  on_hold: { label: "on hold", tone: "cold" },
};

// Migrado desde el ESTADO_PILL inline de app/cola/page.tsx (V5.x).
export function pillParaEstado(estado: string | null | undefined) {
  return estado ? ESTADO_PILL[estado] : undefined;
}
