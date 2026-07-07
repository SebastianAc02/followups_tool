"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "../ui/cn";
import { Chip } from "../ui/Chip";
import { CanalDot } from "../ui/CanalTag";
import { CANAL_DOT_HALO } from "../ui/canal-tag.variants.ts";
import { pillParaEstado } from "../ui/pill.variants.ts";
import { SeverityText } from "../ui/SeverityText";
import { FILTROS_ORDEN, filtrarPorCanal, conteosPorCanal, type FilaAgenda, type FiltroCanal } from "./agenda.ts";

// Traduccion literal de la tarjeta interna de #today-agenda en Arc (Sales Followup
// Cockpit / index.html): header con contador, chips de filtro, hairline, filas.
export function AgendaHoy({
  filas,
  registrarTapAction,
}: {
  filas: FilaAgenda[];
  registrarTapAction: (formData: FormData) => void | Promise<void>;
}) {
  const [filtro, setFiltro] = useState<FiltroCanal>("todos");
  const conteos = conteosPorCanal(filas);
  const visibles = filtrarPorCanal(filas, filtro);

  return (
    <div className="overflow-hidden rounded-xl border border-line-card-now bg-surface">
      <div className="flex items-baseline justify-between px-7 pt-6 pb-4">
        <span className="text-xs font-semibold uppercase tracking-widest text-faint">Tu agenda de hoy</span>
        <span className="text-xs text-faint">
          {visibles.length} de {filas.length} toques
        </span>
      </div>

      <div className="flex flex-wrap gap-2 px-7 pb-4">
        {FILTROS_ORDEN.map(({ filtro: f, label }) => (
          <Chip key={f} tone="accent" on={filtro === f} onClick={() => setFiltro(f)}>
            {f !== "todos" && <CanalDot canal={f} className="size-1.5" />}
            {label} <span className="font-bold opacity-60">{conteos[f]}</span>
          </Chip>
        ))}
      </div>

      <div className="mx-7 h-px bg-line-card-now" />

      {visibles.length === 0 ? (
        <div className="py-6 text-center text-[13px] text-muted">Nada en este canal.</div>
      ) : (
        <div className="flex flex-col px-4 py-3">
          {visibles.map((fila, i) => {
            const pill = pillParaEstado(fila.estado);
            return (
              <div key={fila.id} className="group">
                <Link
                  href={`/llamada/${fila.id}`}
                  className={cn(
                    "flex items-center gap-4 rounded-lg px-3 py-3.5 transition-colors duration-150 hover:bg-hover",
                    fila.actual && "mb-1 rounded-xl border border-border-accent bg-surface-hi px-3 py-4 hover:bg-surface-hi",
                  )}
                >
                  <div
                    className={cn(
                      "w-12 flex-shrink-0 text-sm tabular-nums",
                      fila.actual ? "font-serif text-base leading-none text-ink" : "text-muted",
                    )}
                  >
                    {i + 1}
                  </div>
                  <CanalDot canal={fila.canal} className={cn(fila.actual && CANAL_DOT_HALO[fila.canal])} />
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <span className={cn("truncate text-sm", fila.actual ? "font-semibold text-ink" : "font-medium text-ink-soft")}>
                      {fila.empresa}
                    </span>
                    {(pill || fila.ciudad) && (
                      <span className="shrink-0 truncate text-xs text-faint">
                        · {[pill?.label, fila.ciudad].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </div>
                  {fila.actual ? (
                    <span className="shrink-0 text-xs font-semibold uppercase tracking-widest text-acento">Ahora</span>
                  ) : (
                    <SeverityText variant={fila.sev} className="shrink-0 text-xs">
                      {fila.severidadTexto}
                    </SeverityText>
                  )}
                </Link>
                <form
                  action={registrarTapAction}
                  className="animate-fade-up mt-1.5 hidden items-center gap-2 pl-[76px] group-hover:flex"
                >
                  <input type="hidden" name="idEmpresa" value={fila.id} />
                  <input
                    name="objecion"
                    placeholder="Objeción (opcional)"
                    className="min-w-0 flex-1 border-b border-line bg-transparent text-[12.5px] text-ink-soft outline-none placeholder:text-faint focus:border-line-strong"
                  />
                  <button type="submit" name="canal" value="whatsapp" className="text-[12px] text-muted hover:text-ink">
                    WhatsApp
                  </button>
                  <button type="submit" name="canal" value="correo" className="text-[12px] text-muted hover:text-ink">
                    Correo
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      )}

      <div className="pb-4" />
    </div>
  );
}
