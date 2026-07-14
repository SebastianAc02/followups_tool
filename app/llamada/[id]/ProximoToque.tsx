"use client";

import { plusDias } from "../../lib/date-utils";

const CHIPS: [string, number][] = [["+1d", 1], ["+3d", 3], ["+1sem", 7]];

// Bloque "Proximo toque" (chips +1d/+3d/+1sem + date picker), extraido de
// CapturaLlamada (2026-07-14) para reusarlo en EditorWhatsapp/EditorCorreo sin
// triplicar el markup -- mismo patron visual en los 3 canales.
export function ProximoToque({
  fecha,
  onChange,
  name,
  accentClase = "border-accent-llamada bg-accent-llamada-soft text-ink",
}: {
  fecha: string;
  onChange: (fecha: string) => void;
  // Solo lo necesita CapturaLlamada: el input viaja en el FormData de
  // registrarToqueAction. EditorWhatsapp/EditorCorreo llaman la action directo con el
  // valor de estado, no necesitan name.
  name?: string;
  accentClase?: string;
}) {
  return (
    <div>
      <div className="mb-2 font-toque-mono text-[10.5px] uppercase tracking-wide text-faint">Próximo toque</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {CHIPS.map(([l, d]) => (
          <button
            type="button"
            key={l}
            onClick={() => onChange(plusDias(d))}
            className={`rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${
              fecha === plusDias(d) ? accentClase : "border-line text-muted hover:border-line-strong"
            }`}
          >
            {l}
          </button>
        ))}
        <input
          type="date"
          name={name}
          value={fecha}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-lg border border-line bg-shell px-2 py-1 text-[12px] text-ink"
        />
      </div>
    </div>
  );
}

export default ProximoToque;
