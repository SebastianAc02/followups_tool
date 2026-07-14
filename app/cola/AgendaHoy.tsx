"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "../ui/cn";
import { Chip } from "../ui/Chip";
import { CanalDot } from "../ui/CanalTag";
import { CANAL_DOT_HALO } from "../ui/canal-tag.variants.ts";
import { pillParaEstado } from "../ui/pill.variants.ts";
import { SeverityText } from "../ui/SeverityText";
import { FILTROS_ORDEN, filtrarPorCanal, conteosPorCanal, type FilaAgenda, type FiltroCanal } from "./agenda.ts";

const FOCO_STORAGE_KEY = "onepay:cola:foco";

// Traduccion literal de la tarjeta interna de #today-agenda en Arc (Sales Followup
// Cockpit / index.html): header con contador, chips de filtro, hairline, filas.
// Fix 3 (2026-07-08): filas con afordancia de tarjeta propia (antes se fundian en
// un flex-col sin separación), tap rápido pasa de form-en-hover a menú "···" por
// fila, y se agrega el toggle de modo foco (arranca en Foco -- decidido 2026-07-08).
export function AgendaHoy({
  filas,
  registrarTapAction,
}: {
  filas: FilaAgenda[];
  registrarTapAction: (formData: FormData) => void | Promise<void>;
}) {
  const [filtro, setFiltro] = useState<FiltroCanal>("todos");
  const [foco, setFoco] = useState(true);
  const conteos = conteosPorCanal(filas);
  const visibles = filtrarPorCanal(filas, filtro);

  useEffect(() => {
    const guardado = window.localStorage.getItem(FOCO_STORAGE_KEY);
    if (guardado === "0") setFoco(false);
  }, []);

  function alternarFoco() {
    setFoco((actual) => {
      const siguiente = !actual;
      window.localStorage.setItem(FOCO_STORAGE_KEY, siguiente ? "1" : "0");
      return siguiente;
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line-card bg-card">
      <div className="flex items-center justify-between gap-3 px-7 pt-6 pb-4">
        <span className="text-xs font-semibold uppercase tracking-widest text-faint">Tu agenda de hoy</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-faint">
            {visibles.length} de {filas.length} toques
          </span>
          <button
            type="button"
            onClick={alternarFoco}
            title={foco ? "Ver toda la agenda" : "Enfocar solo el próximo paso"}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest transition-colors",
              foco ? "border-accent/40 bg-accent/10 text-accent-soft" : "border-line-card text-faint hover:text-ink",
            )}
          >
            {foco ? "Foco" : "Agenda completa"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 px-7 pb-4">
        {FILTROS_ORDEN.map(({ filtro: f, label }) => (
          <Chip key={f} tone="accent" on={filtro === f} onClick={() => setFiltro(f)}>
            {f !== "todos" && <CanalDot canal={f} className="size-1.5" />}
            {label} <span className="font-bold opacity-60">{conteos[f]}</span>
          </Chip>
        ))}
      </div>

      <div className="mx-7 h-px bg-line-card" />

      {visibles.length === 0 ? (
        <div className="py-6 text-center text-[13px] text-muted">Nada en este canal.</div>
      ) : (
        <div
          className={cn(
            "flex flex-col gap-2 px-4 py-4 transition-[filter,opacity] duration-200",
            foco && "pointer-events-none opacity-40 blur-[2px]",
          )}
        >
          {visibles.map((fila, i) => {
            const pill = pillParaEstado(fila.estado);
            return (
              <div
                key={fila.id}
                className={cn(
                  "group relative flex items-center gap-1 rounded-xl border border-line-card bg-surface-2 transition-colors duration-150 hover:border-accent-soft hover:bg-card-hover",
                  fila.actual && "border-border-accent bg-surface-hi hover:bg-surface-hi",
                )}
              >
                <Link href={`/llamada/${fila.id}`} className="flex min-w-0 flex-1 items-center gap-4 px-3 py-3.5">
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
                <FilaAcciones idEmpresa={fila.id} registrarTapAction={registrarTapAction} />
              </div>
            );
          })}
        </div>
      )}

      <div className="pb-4" />
    </div>
  );
}

// Tap rápido rediseñado (Fix 3, decidido 2026-07-08): menú "···" explícito por fila
// en vez de un form que aparecía solo, sin avisar, al pasar el mouse. Mismo
// registrarTapAction real, solo cambia cómo se dispara.
export function FilaAcciones({
  idEmpresa,
  registrarTapAction,
}: {
  idEmpresa: string;
  registrarTapAction: (formData: FormData) => void | Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!abierto) return;
    function cerrarSiClickAfuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", cerrarSiClickAfuera);
    return () => document.removeEventListener("mousedown", cerrarSiClickAfuera);
  }, [abierto]);

  return (
    <div ref={ref} className="relative mr-2 flex-shrink-0">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        title="Tap rápido"
        className="flex h-7 w-7 items-center justify-center rounded-full text-faint opacity-0 transition-opacity hover:bg-hover hover:text-ink group-hover:opacity-100 data-[open=true]:opacity-100"
        data-open={abierto}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>

      {abierto && (
        <form
          action={(fd) => {
            registrarTapAction(fd);
            setAbierto(false);
          }}
          className="animate-fade-up absolute right-0 top-[calc(100%+4px)] z-20 w-64 rounded-[11px] border border-line-card bg-card p-3 shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
        >
          <input type="hidden" name="idEmpresa" value={idEmpresa} />
          <input
            name="objecion"
            placeholder="Objeción (opcional)"
            className="mb-2.5 w-full rounded-lg border border-line-card bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-ink-soft outline-none placeholder:text-faint focus:border-line-strong"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              name="canal"
              value="whatsapp"
              className="flex-1 rounded-md border border-line-card px-2.5 py-1.5 text-[12px] font-medium text-ink-soft hover:border-canal-whatsapp/40 hover:text-canal-whatsapp"
            >
              WhatsApp
            </button>
            <button
              type="submit"
              name="canal"
              value="correo"
              className="flex-1 rounded-md border border-line-card px-2.5 py-1.5 text-[12px] font-medium text-ink-soft hover:border-canal-correo/40 hover:text-canal-correo"
            >
              Correo
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
