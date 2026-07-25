import Link from "next/link";
import { cn } from "../ui/cn";
import { Pill } from "../ui/Pill";
import { pillParaEstado } from "../ui/pill.variants.ts";
import { canalPill, CANAL_LABEL, type Canal } from "../ui/canal-tag.variants.ts";
import { button } from "../ui/button.variants.ts";
import { canalNormalizado, type BadgeFecha } from "./agenda.ts";

const CTA_POR_CANAL: Record<Canal, string> = {
  llamada: "Llamar ahora",
  whatsapp: "Escribir por WhatsApp",
  correo: "Enviar correo",
};

// Fix 3 (2026-07-08): reestilizada al lenguaje de tarjetas del resto de la app
// (bg-card, border-line-card, button.variants) y marcada explícitamente como
// "Próximo paso" -- antes decía solo "Ahora" y no se leía sin duda como la
// siguiente acción a tomar.
export function BarraAhora({
  id,
  empresa,
  ciudad,
  contacto,
  cargo,
  canal,
  estado,
  badge,
  severidadTexto,
}: {
  id: string;
  empresa: string;
  ciudad?: string | null;
  contacto?: string | null;
  cargo?: string | null;
  canal?: string | null;
  estado?: string | null;
  // El mockup (Arc, #current-follow-up) pone una hora de reloj (09:00) en esta columna. La
  // base solo guarda fecha, no hora, asi que se sustituye por el vencimiento real en vez de
  // inventar un horario (decision del 2026-07-07). Sale de badgeDeFecha: null cuando la fila
  // no tiene fecha, y entonces no se pinta nada.
  badge?: BadgeFecha;
  severidadTexto: string;
}) {
  const canalReal = canalNormalizado(canal);
  const pillEstado = pillParaEstado(estado);

  return (
    <section
      id="current-follow-up"
      className="mb-6 rounded-2xl border border-line-card border-l-2 border-l-accent bg-card px-6 py-5"
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-accent-soft">
          Próximo paso
        </span>
        {badge && (
          <span className="text-xs font-semibold uppercase tracking-widest text-faint">{badge.texto}</span>
        )}
      </div>

      <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-7">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 font-serif text-[26px] leading-[1.1] text-ink">{empresa}</div>
          <div className="mb-3 text-[13.5px] text-muted">
            {[ciudad, contacto ? `${contacto}${cargo ? ` · ${cargo}` : ""}` : null, severidadTexto]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={canalPill({ canal: canalReal })}>{CANAL_LABEL[canalReal]}</span>
            {pillEstado && (
              <Pill tone={pillEstado.tone} dot>
                {pillEstado.label}
              </Pill>
            )}
          </div>
        </div>

        <div className="flex w-full flex-row gap-3 md:w-44 md:flex-shrink-0 md:flex-col md:gap-2">
          <Link href={`/llamada/${id}`} className={cn(button({ variant: "solid" }), "block text-center")}>
            {CTA_POR_CANAL[canalReal]}
          </Link>
          <Link href={`/llamada/${id}`} className={cn(button({ variant: "ghost" }), "block text-center")}>
            Abrir ficha
          </Link>
        </div>
      </div>
    </section>
  );
}
