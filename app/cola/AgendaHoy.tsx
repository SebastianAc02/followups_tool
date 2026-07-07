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
    <div className="mb-8">
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTROS_ORDEN.map(({ filtro: f, label }) => (
          <Chip key={f} on={filtro === f} onClick={() => setFiltro(f)}>
            {label} <span className="mono text-[11px] opacity-70">{conteos[f]}</span>
          </Chip>
        ))}
      </div>

      {visibles.length === 0 ? (
        <div className="py-6 text-[13px] text-muted">Nada en este canal.</div>
      ) : (
        visibles.map((fila, i) => {
          const pill = pillParaEstado(fila.estado);
          return (
            <div
              key={fila.id}
              className={cn(
                "group border-b border-line py-3 transition-colors duration-150 hover:bg-hover/40",
                fila.actual && "bg-hover/60 hover:bg-hover/60",
              )}
            >
              <Link href={`/llamada/${fila.id}`} className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="mono w-5 shrink-0 text-[12px] text-faint">{i + 1}</span>
                  <CanalDot canal={fila.canal} />
                  <span className="truncate font-medium text-ink">{fila.empresa}</span>
                  {pill && <Pill tone={pill.tone}>{pill.label}</Pill>}
                  {fila.ciudad && <span className="shrink-0 text-[13px] text-muted">{fila.ciudad}</span>}
                </div>
                <SeverityText variant={fila.sev} className="shrink-0">
                  {fila.severidadTexto}
                </SeverityText>
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
        })
      )}
    </div>
  );
}
