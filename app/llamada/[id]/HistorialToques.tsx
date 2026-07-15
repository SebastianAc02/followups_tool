"use client";

import { useState } from "react";
import { etiquetaFechaToque } from "../../core/fecha-toque";

export type ToqueHistorial = {
  idToque: number;
  fecha: string | null;
  canal: string | null;
  quePaso: string | null;
  resumen: string | null;
  transcriptUrl: string | null;
};

// La tabla de toques de la ficha, calcada de la subpagina "Toques hechos" de Notion: la fila es
// telegrafica para escanear de un vistazo, y al abrirla sale el resumen largo que escribio la
// tool. Los dos niveles de detalle son a proposito: que_paso corto es lo que hace la lista
// legible, y meterle el texto largo la volveria un muro.
//
// La fecha pasa por etiquetaFechaToque porque toque.fecha guarda cuatro formatos que conviven en
// la DB real (NULL, 'YYYY-MM-DD', 'June 18, 2026', timestamp ISO). Pintarla cruda sacaria
// timestamps enteros en las filas del cockpit.
export function HistorialToques({ toques, hoy }: { toques: ToqueHistorial[]; hoy: string }) {
  const [abierto, setAbierto] = useState<number | null>(null);

  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-ink-soft">Toques</div>
      <div className="flex flex-col gap-1">
        {toques.map((t) => {
          const estaAbierto = abierto === t.idToque;
          const tieneDetalle = Boolean(t.resumen);
          return (
            <div key={t.idToque} className="rounded-lg border border-line bg-shell">
              <button
                type="button"
                onClick={() => setAbierto(estaAbierto ? null : t.idToque)}
                disabled={!tieneDetalle}
                aria-expanded={estaAbierto}
                className="flex w-full items-start gap-2 p-2 text-left disabled:cursor-default"
              >
                <span className="shrink-0 font-toque-mono text-[9.5px] uppercase tracking-wide text-faint">
                  {etiquetaFechaToque(t.fecha, hoy)}
                </span>
                <span className="flex-1 text-[11.5px] leading-snug text-ink-soft">
                  {t.quePaso ?? t.canal ?? "Sin nota"}
                </span>
                {tieneDetalle ? (
                  <span className="shrink-0 font-toque-mono text-[9px] text-muted">
                    {estaAbierto ? "CERRAR" : "VER"}
                  </span>
                ) : null}
              </button>
              {estaAbierto && t.resumen ? (
                <div className="border-t border-line px-2 py-2">
                  <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-muted">{t.resumen}</p>
                  {t.transcriptUrl ? (
                    <a
                      href={t.transcriptUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block font-toque-mono text-[9.5px] text-accent-llamada hover:underline"
                    >
                      VER EN GRANOLA
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
