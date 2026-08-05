// La lista completa, detrás de un clic (regla del rediseño: "no al frente"). Sirve para UNA
// cosa: saltar a una cuenta puntual sin esperar a que la cola llegue a ella sola. El día a día es
// la tarjeta de arriba + "siguiente"; esto es la válvula de escape para cuando el operador ya
// sabe a quién quiere llamar.
//
// <details> nativo: no hay que cablear estado de cliente para algo que es, literalmente, "muéstrame
// más cuando lo pida".
import Link from "next/link";
import { TANDA_LABEL, textoDiasEnEstado } from "../ui/tanda.variants";
import type { GrupoTanda, PosicionCola } from "./tandas-datos";

export function ListaTanda({ grupos, actual, total }: { grupos: GrupoTanda[]; actual: PosicionCola; total: number }) {
  if (total === 0) return null;

  return (
    <details className="mb-8">
      <summary className="cursor-pointer list-none text-[13px] font-semibold text-muted hover:text-ink">
        Ver la cola completa · {total} cuenta{total === 1 ? "" : "s"}
      </summary>
      <div className="mt-3 space-y-4">
        {grupos.map(
          (g) =>
            g.total > 0 && (
              <div key={g.tanda}>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">
                  {TANDA_LABEL[g.tanda]} · {g.total}
                </div>
                <div className="overflow-hidden rounded-xl border border-line-card">
                  {g.cuentas.map((c, i) => {
                    const esActual = actual?.tanda === g.tanda && actual.indice === i;
                    return (
                      <Link
                        key={c.idEmpresa}
                        href={`/cola?tanda=${g.tanda}&i=${i}`}
                        className={
                          "flex items-center justify-between gap-3 border-b border-line-card px-4 py-2.5 text-[13px] last:border-b-0 hover:bg-surface-2" +
                          (esActual ? " bg-accent-llamada-soft" : "")
                        }
                      >
                        <span className="truncate text-ink-soft">{c.cuenta}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          {c.advertencias.length > 0 && (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-overdue"
                              aria-hidden="true"
                              title={`${c.advertencias.length} advertencia(s)`}
                            />
                          )}
                          <span className="text-faint">{textoDiasEnEstado(c.diasEnEstado)}</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ),
        )}
      </div>
    </details>
  );
}
