import type { Calificacion } from "../../core/calificacion";

// Checklist de calificacion del Toque 1: que ya tengo de la cuenta (dato cacheado) vs que
// me toca preguntar en la llamada. La logica de que cuenta como "tengo" vive en
// app/core/calificacion.ts (dominio puro) -- este componente solo pinta el resultado.

export function CalificacionChecklist({ calificacion }: { calificacion: Calificacion }) {
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
