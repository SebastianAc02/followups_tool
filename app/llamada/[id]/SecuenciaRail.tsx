import type { PasoSecuencia, ContextoToque } from "../../db/repository";
import { CANAL_LABEL, type Canal } from "../../ui/canal-tag.variants.ts";
import { cn } from "../../ui/cn";
import { etiquetaFechaToque, esToqueDeLaHerramienta } from "../../core/fecha-toque";

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
  estado,
  hoy,
}: {
  pasos: PasoSecuencia[];
  objetivo: string | null;
  toques?: ContextoToque["toques"];
  // 'YYYY-MM-DD' resuelto en el server. El riel no calcula "hoy" por su cuenta: si lo
  // hiciera en el cliente, el dia dependeria del reloj del navegador y "hoy" podria
  // discrepar de lo que la cola ya decidio en el servidor.
  hoy: string;
  // Estado de la empresa (empresa.estado_notion): decide si se muestra el banner de
  // "historial incompleto" cuando no hay secuencia activa (2026-07-14). 'lead' es la
  // unica etapa donde la herramienta sabe con certeza que el ciclo de vida esta
  // completo (nunca se trabajo fuera de ella) -- ahi no se muestra.
  estado?: string | null;
}) {
  return (
    <div className="flex flex-col border-b border-line md:border-b-0 md:border-r">
      <div className="px-4 pb-2 pt-4 font-toque-mono text-[9.5px] font-semibold uppercase tracking-widest text-faint">
        SECUENCIA · {pasos.length} DÍAS
      </div>

      {/* flex-1 + min-h-0 en vez de max-h fija: el historial se estira hasta donde llegue
          la columna (el OBJETIVO sigue anclado abajo con mt-auto) y solo hace scroll si
          de verdad se pasa. Con max-h-[196px] se cortaba aunque sobrara espacio. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-2">
        {pasos.length === 0 ? (
          <div className="pl-1">
            <p className="text-xs text-muted">Sin secuencia activa · llamada suelta</p>
            {estado != null && estado !== "lead" && (
              <p className="mt-2 rounded-lg border border-line bg-shell-2 px-2.5 py-2 text-[11px] leading-snug text-faint">
                Hay historial que no se guardó en la herramienta: esta cuenta se empezó a
                tocar antes.
              </p>
            )}
            {toques && toques.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2">
                {/* Jerarquia: la fecha manda (ink / ink-soft) y el detalle acompaña
                    (ink-soft / muted). Lo "previo" se distingue por la etiqueta, NO por
                    apagarlo hasta que no se lea: un toque viejo sigue siendo historial
                    que Sebastian necesita leer en la llamada. */}
                {toques.map((t) => {
                  const enLaHerramienta = esToqueDeLaHerramienta(t.fuente);
                  return (
                    <li
                      key={t.idToque}
                      className={cn(
                        "text-[11.5px] leading-snug",
                        enLaHerramienta ? "text-ink-soft" : "text-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "font-toque-mono font-semibold",
                          enLaHerramienta ? "text-ink" : "text-ink-soft",
                        )}
                      >
                        {etiquetaFechaToque(t.fecha, hoy)}
                      </span>{" "}
                      · {canalLegible(t.canal)} · {t.resultado ?? "sin resultado"}
                      {!enLaHerramienta && (
                        <span
                          className="ml-1 rounded border border-line px-1 font-toque-mono text-[9px] uppercase tracking-wide text-muted"
                          title="Toque anterior a la herramienta, importado de Notion"
                        >
                          previo
                        </span>
                      )}
                    </li>
                  );
                })}
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
