import type { PasoSecuencia, ContextoToque } from "../../db/repository";
import { CANAL_LABEL, type Canal } from "../../ui/canal-tag.variants.ts";
import { cn } from "../../ui/cn";

// Riel vertical de la secuencia del Toque 1 (specimen "Onepay Llamada Toque 1"): un nodo
// por paso de la cadencia (hecho/activo/pendiente) + el objetivo del paso activo al fondo.
// Si la empresa no tiene inscripcion activa (getContextoToque ya resuelve eso en server),
// pasos llega vacio -- no es un error, es el caso "llamada suelta" y el riel degrada a
// mostrar los ultimos toques en vez de inventar una secuencia que no existe.

function canalLegible(canal: string | null): string {
  if (!canal) return "Sin canal";
  return CANAL_LABEL[canal as Canal] ?? canal.charAt(0).toUpperCase() + canal.slice(1);
}

function NodoHecho() {
  return (
    <span
      className="absolute -left-[19px] top-0.5 flex h-3 w-3 items-center justify-center rounded-full border-2 border-check bg-bg"
      aria-hidden="true"
    >
      <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4} className="text-check">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}

function NodoPendiente() {
  return (
    <span
      className="absolute -left-[19px] top-0.5 h-3 w-3 rounded-full border-2 border-line-strong"
      aria-hidden="true"
    />
  );
}

function NodoActivo() {
  return (
    <span
      className="absolute -left-5 top-0 h-3.5 w-3.5 animate-[pulseLive_1.8s_ease-out_infinite] rounded-full bg-accent-llamada"
      aria-hidden="true"
    />
  );
}

export function SecuenciaRail({
  pasos,
  objetivo,
  toques,
}: {
  pasos: PasoSecuencia[];
  objetivo: string | null;
  toques?: ContextoToque["toques"];
}) {
  return (
    <div className="flex flex-col border-b border-line md:border-b-0 md:border-r">
      <div className="px-4 pb-2 pt-4 font-toque-mono text-[9.5px] font-semibold uppercase tracking-widest text-faint">
        SECUENCIA · {pasos.length} DÍAS
      </div>

      <div className="max-h-[196px] overflow-y-auto px-4 pb-2">
        {pasos.length === 0 ? (
          <div className="pl-1">
            <p className="text-xs text-muted">Sin secuencia activa · llamada suelta</p>
            {toques && toques.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2">
                {toques.map((t) => (
                  <li key={t.idToque} className="text-[11px] leading-snug text-faint">
                    <span className="font-toque-mono">{t.fecha}</span> · {canalLegible(t.canal)} · {t.resultado ?? "sin resultado"}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="relative pl-5">
            <div className="absolute bottom-5 left-2 top-1 w-px bg-line" aria-hidden="true" />
            {pasos.map((p) => {
              if (p.estado === "activo") {
                return (
                  <div key={p.orden} className="relative mb-4">
                    <NodoActivo />
                    <div className="-ml-1 rounded-lg border border-accent-llamada bg-accent-llamada-soft p-2">
                      <div className="text-[11.5px] font-semibold text-ink">
                        Día {p.orden} · {canalLegible(p.canal)}
                      </div>
                      <div className="text-[10.5px] text-accent-llamada">{p.objetivo}</div>
                    </div>
                  </div>
                );
              }
              return (
                <div key={p.orden} className={cn("relative mb-4", p.estado === "hecho" && "opacity-55")}>
                  {p.estado === "hecho" ? <NodoHecho /> : <NodoPendiente />}
                  <div className="text-[11.5px] font-semibold text-ink-soft">
                    Día {p.orden} · {canalLegible(p.canal)}
                  </div>
                  <div className="text-[10.5px] text-faint">{p.objetivo}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-auto border-t border-line px-4 py-3">
        <div className="mb-1 font-toque-mono text-[9.5px] uppercase tracking-widest text-faint">OBJETIVO</div>
        <div className="text-base font-semibold text-ink">{objetivo ?? "Sin objetivo definido"}</div>
      </div>
    </div>
  );
}
