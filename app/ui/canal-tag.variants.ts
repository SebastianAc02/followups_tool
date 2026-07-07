import { cva } from "class-variance-authority";

export type Canal = "llamada" | "correo" | "whatsapp";

export const CANAL_LABEL: Record<Canal, string> = {
  llamada: "Llamada",
  correo: "Correo",
  whatsapp: "WhatsApp",
};

// 8px por defecto (fila de agenda); AgendaHoy pasa size-[7px] en los chips y
// size-[9px]+halo en la fila "actual" -- ver Cockpit (2).html .row__dot/.chip__dot.
export const canalDot = cva("inline-block h-2 w-2 shrink-0 rounded-full", {
  variants: {
    canal: {
      llamada: "bg-canal-llamada",
      correo: "bg-canal-correo",
      whatsapp: "bg-canal-whatsapp",
    } satisfies Record<Canal, string>,
  },
});

export const canalTagText = cva("text-[11px] font-medium", {
  variants: {
    canal: {
      llamada: "text-canal-llamada",
      correo: "text-canal-correo",
      whatsapp: "text-canal-whatsapp",
    } satisfies Record<Canal, string>,
  },
});

// Halo del punto de canal en la fila "actual" de AgendaHoy: box-shadow 0 0 0 4px
// del color del canal al 18% -- ver Cockpit (2).html .row--now .row__dot.
export const CANAL_DOT_HALO: Record<Canal, string> = {
  llamada: "shadow-[0_0_0_4px_rgba(143,176,224,0.18)]",
  correo: "shadow-[0_0_0_4px_rgba(211,160,166,0.18)]",
  whatsapp: "shadow-[0_0_0_4px_rgba(132,201,158,0.18)]",
};

// Pill rellena de canal (BarraAhora): calca .pill--llamada de Cockpit (2).html
// (bg #16202e / borde #26364d / texto accent-2 para Llamada). Correo/WhatsApp
// interpolan el mismo patron a partir de su propio color -- el mockup solo
// especifica el caso Llamada.
export const canalPill = cva(
  "inline-flex items-center rounded-[7px] border px-[11px] py-[3px] text-[11.5px] font-semibold",
  {
    variants: {
      canal: {
        llamada: "border-[#26364d] bg-[#16202e] text-canal-llamada",
        correo: "border-canal-correo/30 bg-canal-correo/10 text-canal-correo",
        whatsapp: "border-canal-whatsapp/30 bg-canal-whatsapp/10 text-canal-whatsapp",
      } satisfies Record<Canal, string>,
    },
  },
);
