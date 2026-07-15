import { CalificacionChecklist } from "./CalificacionChecklist";
import { HistorialToques, type ToqueHistorial } from "./HistorialToques";
import type { Calificacion } from "../../core/calificacion";

// El panel derecho de la ficha. UN solo panel para un lead y para un cierre: se densifica con el
// dato, no se ramifica por estado_notion. En un lead recien llamado Discovery no aparece porque
// no hay data, no porque una regla lo esconda; en un cierre esta denso porque la hay.
//
// Antes de 2026-07-15 esto era un checklist fijo de calificacion que pintaba lo mismo en
// cualquier etapa, y por eso una cuenta en cierre mostraba "Como hacen el recaudo" con un
// PREGUNTAR que nadie podia llenar. La causa no era una mala decision de diseño: era que la tool
// no tenia nada mas que mostrar, porque las Notas Discovery se mandaban a Notion y se olvidaban.
export function PanelCuenta({
  idEmpresa,
  calificacion,
  notasDiscovery,
  toques,
  hoy,
}: {
  idEmpresa: string;
  calificacion: Calificacion;
  notasDiscovery: string | null;
  toques: ToqueHistorial[];
  hoy: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <CalificacionChecklist idEmpresa={idEmpresa} calificacion={calificacion} />

      {notasDiscovery ? (
        <div>
          <div className="mb-2 text-xs font-semibold text-ink-soft">Discovery</div>
          <p className="whitespace-pre-wrap rounded-lg border border-line bg-shell p-3 text-[12px] leading-relaxed text-ink-soft">
            {notasDiscovery}
          </p>
        </div>
      ) : null}

      {toques.length > 0 ? <HistorialToques toques={toques} hoy={hoy} /> : null}
    </div>
  );
}
