"use client";

import type { Calificacion } from "../../core/calificacion";
import { usePreguntar } from "./PreguntarContext";

// Checklist de calificacion del Toque 1: que ya tengo de la cuenta (dato cacheado) vs que
// me toca preguntar en la llamada. La logica de que cuenta como "tengo" vive en
// app/core/calificacion.ts (dominio puro) -- este componente solo pinta el resultado.
//
// Items PREGUNTAR clickeables (2026-07-08): usuarios/crm/pasarela SI tienen donde
// guardarse (columnas reales, ver registrarToque en el repository), asi que un click
// abre el formulario de abajo enfocado en ese campo. "Cómo hacen el recaudo" se queda
// sin click a proposito -- no tiene columna en empresa todavia (decision de esquema
// aparte, ver docs/superpowers/specs), y CapturaLlamada tampoco tiene un input para
// el: prometer un click que no guarda nada seria peor que dejarlo como esta.
const CAMPOS_CON_INPUT = new Set(["usuarios", "crm", "pasarela"]);

export function CalificacionChecklist({ calificacion }: { calificacion: Calificacion }) {
  const { abrir } = usePreguntar();
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-xs font-semibold text-ink-soft">Calificación</span>
        <span className="font-toque-mono text-[10px] font-semibold text-muted">
          {calificacion.tengo} / {calificacion.total}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {calificacion.items.map((item) =>
          item.estado === "tengo" ? (
            <div key={item.campo} className="flex items-center gap-2 border-b border-line py-2">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-check/15" aria-hidden="true">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4} className="text-check">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <span className="flex-1 text-[12.5px] text-muted">{item.label}</span>
              <span className="font-toque-mono text-[13px] font-semibold text-ink">{item.valor}</span>
            </div>
          ) : CAMPOS_CON_INPUT.has(item.campo) ? (
            <button
              type="button"
              key={item.campo}
              onClick={() => abrir(item.campo)}
              title="Abrir el formulario de registro con este campo listo para llenar"
              className="flex w-full items-center gap-2 rounded-lg border border-dashed border-pending bg-pending-soft px-3 py-2 text-left transition-colors hover:border-solid hover:bg-pending-soft/70"
            >
              <span className="h-4 w-4 shrink-0 rounded-full border border-pending" aria-hidden="true" />
              <span className="flex-1 text-[12.5px] font-semibold text-pending">{item.label}</span>
              <span className="font-toque-mono text-[9px] font-semibold text-pending">PREGUNTAR</span>
            </button>
          ) : (
            <div
              key={item.campo}
              className="flex items-center gap-2 rounded-lg border border-dashed border-pending bg-pending-soft px-3 py-2"
            >
              <span className="h-4 w-4 shrink-0 rounded-full border border-pending" aria-hidden="true" />
              <span className="flex-1 text-[12.5px] font-semibold text-pending">{item.label}</span>
              <span className="font-toque-mono text-[9px] font-semibold text-pending">PREGUNTAR</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
