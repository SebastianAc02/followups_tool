import { cva } from "class-variance-authority";

export type Canal = "llamada" | "correo" | "whatsapp";

export const CANAL_LABEL: Record<Canal, string> = {
  llamada: "Llamada",
  correo: "Correo",
  whatsapp: "WhatsApp",
};

export const canalDot = cva("inline-block h-1.5 w-1.5 shrink-0 rounded-full", {
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
