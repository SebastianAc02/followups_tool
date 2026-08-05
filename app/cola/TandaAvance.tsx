// Arriba de la pantalla: que tanda se esta corriendo y el avance dentro de ella, literal como lo
// pidio el rediseño ("Re-llamadas, 4 de 12"). Reemplaza la fila de StatCards + la barra "Próximo
// paso" -- las dos hablaban de metricas generales del dia; esto dice UNA cosa: en que tanda esta
// parado el operador ahora mismo, y cuanto le falta para vaciarla.
import { TANDA_LABEL } from "../ui/tanda.variants";
import type { Tanda } from "../core/tandas";

export function TandaAvance({ tanda, indice, total }: { tanda: Tanda; indice: number; total: number }) {
  return (
    <div className="mb-5 flex items-baseline gap-2.5">
      <h2 className="font-serif text-2xl tracking-tight text-ink md:text-3xl">{TANDA_LABEL[tanda]}</h2>
      <span className="font-body text-sm font-semibold tabular-nums text-muted">
        {indice + 1} de {total}
      </span>
    </div>
  );
}
