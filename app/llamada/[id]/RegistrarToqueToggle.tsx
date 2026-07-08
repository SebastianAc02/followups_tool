"use client";

import { useState } from "react";
import CapturaLlamada from "./CapturaLlamada";

// LlamadaCard es server component (no necesita "use client" para pintar). El unico estado
// de UI que hace falta aca es el toggle de visibilidad del formulario -- en vez de convertir
// toda la card a client, se aisla en este wrapper chico. Patron menos invasivo: mantiene
// LlamadaCard como server component y solo paga el costo de hidratacion en este boton.
export function RegistrarToqueToggle({ idEmpresa }: { idEmpresa: string }) {
  const [abierto, setAbierto] = useState(false);

  if (abierto) {
    return <CapturaLlamada idEmpresa={idEmpresa} />;
  }

  return (
    <button
      type="button"
      onClick={() => setAbierto(true)}
      className="rounded-lg bg-accent-llamada px-4 py-2 text-[12.5px] font-semibold text-ink transition-colors hover:opacity-90"
    >
      Registrar toque
    </button>
  );
}

export default RegistrarToqueToggle;
