"use client";

import CapturaLlamada from "./CapturaLlamada";
import { usePreguntar } from "./PreguntarContext";
import type { Calificacion } from "../../core/calificacion";

// LlamadaCard es server component (no necesita "use client" para pintar). El estado de
// abierto/campoEnfocado vive en PreguntarContext (2026-07-08), compartido con
// CalificacionChecklist -- antes este componente tenia su propio useState aislado, por
// eso un click en un item "PREGUNTAR" del checklist no podia abrir el formulario.
export function RegistrarToqueToggle({ idEmpresa, calificacion }: { idEmpresa: string; calificacion: Calificacion }) {
  const { abierto, abrir } = usePreguntar();

  if (abierto) {
    return <CapturaLlamada idEmpresa={idEmpresa} calificacion={calificacion} />;
  }

  return (
    <button
      type="button"
      onClick={() => abrir()}
      className="rounded-lg bg-accent-llamada px-4 py-2 text-[12.5px] font-semibold text-ink transition-colors hover:opacity-90"
    >
      Registrar toque
    </button>
  );
}

export default RegistrarToqueToggle;
