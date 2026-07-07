import Link from "next/link";
import { cn } from "../ui/cn";
import { Pill } from "../ui/Pill";
import { pillParaEstado } from "../ui/pill.variants.ts";
import { CanalTag } from "../ui/CanalTag";
import { button } from "../ui/button.variants.ts";
import type { Canal } from "../ui/canal-tag.variants.ts";

const CTA_POR_CANAL: Record<Canal, string> = {
  llamada: "Llamar ahora",
  whatsapp: "Escribir por WhatsApp",
  correo: "Enviar correo",
};

function canalNormalizado(canal: string | null | undefined): Canal {
  return canal === "whatsapp" || canal === "correo" ? canal : "llamada";
}

export function BarraAhora({
  id,
  empresa,
  ciudad,
  contacto,
  cargo,
  canal,
  estado,
}: {
  id: string;
  empresa: string;
  ciudad?: string | null;
  contacto?: string | null;
  cargo?: string | null;
  canal?: string | null;
  estado?: string | null;
}) {
  const canalReal = canalNormalizado(canal);
  const pillEstado = pillParaEstado(estado);

  return (
    <div className="mb-8 rounded-2xl border border-line bg-surface px-7 py-6">
      <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.09em] text-acento">Ahora</div>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-serif text-[26px] font-medium tracking-[-0.01em] text-ink">{empresa}</span>
            {pillEstado && <Pill tone={pillEstado.tone}>{pillEstado.label}</Pill>}
          </div>
          <div className="mt-1.5 text-[13px] text-muted">
            {[ciudad, contacto ? `${contacto}${cargo ? ` · ${cargo}` : ""}` : null].filter(Boolean).join(" · ")}
          </div>
          <CanalTag canal={canalReal} className="mt-3" />
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link href={`/llamada/${id}`} className={cn(button({ variant: "pill" }), "inline-block")}>
            {CTA_POR_CANAL[canalReal]}
          </Link>
          <Link href={`/llamada/${id}`} className="text-[13px] text-muted transition-colors hover:text-ink">
            Abrir ficha
          </Link>
        </div>
      </div>
    </div>
  );
}
