"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "../ui/cn";
import { Chip } from "../ui/Chip";
import { CanalDot } from "../ui/CanalTag";
import { Pill } from "../ui/Pill";
import { pillParaEstado } from "../ui/pill.variants.ts";
import { SeverityText } from "../ui/SeverityText";
import { FILTROS_ORDEN, filtrarPorCanal, conteosPorCanal, type FilaAgenda, type FiltroCanal } from "./agenda.ts";

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
    <div className="mb-8 rounded-2xl border border-line bg-surface px-7 py-[22px]">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[11.5px] tracking-[0.14em] text-faint uppercase">Tu agenda de hoy</div>
        <div className="text-[12.5px] text-faint">
          {visibles.length} de {filas.length} toques
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTROS_ORDEN.map(({ filtro: f, label }) => (
          <Chip key={f} tone="accent" on={filtro === f} onClick={() => setFiltro(f)}>
            {f !== "todos" && <CanalDot canal={f} />}
            {label} <span className="mono text-[11px] opacity-70">{conteos[f]}</span>
          </Chip>
        ))}
      </div>

      {visibles.length === 0 ? (
        <div className="py-6 text-[13px] text-muted">Nada en este canal.</div>
      ) : (
        <div className="flex flex-col">
          {visibles.map((fila, i) => {
            const pill = pillParaEstado(fila.estado);
            return (
              <div
                key={fila.id}
                className={cn(
                  "group rounded-lg px-4 py-[11px] transition-colors duration-150 hover:bg-hover",
                  fila.actual && "mb-1 rounded-[10px] border border-border-accent bg-surface-hi px-4 py-[13px] hover:bg-surface-hi",
                )}
              >
                <Link href={`/llamada/${fila.id}`} className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="mono w-5 shrink-0 text-[12px] text-faint">{i + 1}</span>
                    <CanalDot canal={fila.canal} />
                    <span className={cn("truncate text-ink", fila.actual ? "font-semibold" : "font-medium")}>
                      {fila.empresa}
                    </span>
                    {pill && <Pill tone={pill.tone}>{pill.label}</Pill>}
                    {fila.ciudad && <span className="shrink-0 text-[13px] text-muted">{fila.ciudad}</span>}
                  </div>
                  {fila.actual ? (
                    <span className="mono shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-acento">
                      Ahora
                    </span>
                  ) : (
                    <SeverityText variant={fila.sev} className="shrink-0">
                      {fila.severidadTexto}
                    </SeverityText>
                  )}
                </Link>
                <form
                  action={registrarTapAction}
                  className="animate-fade-up mt-1.5 hidden items-center gap-2 pl-8 group-hover:flex"
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
    </div>
  );
}
