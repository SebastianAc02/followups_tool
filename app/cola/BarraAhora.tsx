import Link from "next/link";
import { cn } from "../ui/cn";
import { Pill } from "../ui/Pill";
import { pillParaEstado } from "../ui/pill.variants.ts";
import { canalPill, CANAL_LABEL, type Canal } from "../ui/canal-tag.variants.ts";
import { button } from "../ui/button.variants.ts";
import { canalNormalizado } from "./agenda.ts";
import type { Severity } from "../ui/severity-text.variants.ts";

const CTA_POR_CANAL: Record<Canal, string> = {
  llamada: "Llamar ahora",
  whatsapp: "Escribir por WhatsApp",
  correo: "Enviar correo",
};

// El mockup (Arc, #current-follow-up) pone una hora de reloj (09:00) en la columna
// izquierda. La base solo guarda fecha, no hora -- se sustituye por severidad real
// en vez de inventar un horario (decision explicita del 2026-07-07).
const SEV_LABEL: Record<Severity, string> = { overdue: "VENC.", today: "HOY" };

// Traduccion literal de la seccion #current-follow-up de Arc (Sales Followup
// Cockpit / index.html): tarjeta bg #141416, columna izquierda + divisoria +
// cuerpo + columna de acciones.
export function BarraAhora({
  id,
  empresa,
  ciudad,
  contacto,
  cargo,
  canal,
  estado,
  sev,
  severidadTexto,
}: {
  id: string;
  empresa: string;
  ciudad?: string | null;
  contacto?: string | null;
  cargo?: string | null;
  canal?: string | null;
  estado?: string | null;
  sev: Severity;
  severidadTexto: string;
}) {
  const canalReal = canalNormalizado(canal);
  const pillEstado = pillParaEstado(estado);

  return (
    <section
      id="current-follow-up"
      className="mx-auto mb-4 max-w-5xl rounded-xl border border-line-card-now bg-card-now px-7 py-6"
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-7">
        <div className="flex min-w-0 flex-1 items-center gap-6">
          <div className="flex-shrink-0">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-acento">Ahora</div>
            <div className="font-serif text-[34px] leading-none text-ink">{SEV_LABEL[sev]}</div>
          </div>

          <div className="hidden h-[60px] w-px flex-shrink-0 bg-line-card-now sm:block" />

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
