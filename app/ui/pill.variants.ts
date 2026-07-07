import { cva } from "class-variance-authority";

export type PillTone = "hot" | "warm" | "cold";

// Calca el pill de estado de la tarjeta "Ahora" en Arc (Sales Followup Cockpit):
// shell neutro plano (bg #1c1c20 / borde #232327 / texto #a9a9ad) para las 3 tonos --
// el mockup solo diferencia por el color del punto, no por el fondo del pill.
export const pill = cva(
  "inline-flex items-center gap-1.5 rounded-[7px] border border-[#232327] bg-[#1c1c20] px-[11px] py-[3px] text-[11.5px] font-semibold text-[#a9a9ad]",
);

// Color del punto dentro del pill, por tono -- unico elemento que varia.
export const pillDot: Record<PillTone, string> = {
  hot: "bg-today",
  warm: "bg-ink-soft",
  cold: "bg-faint",
};

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
