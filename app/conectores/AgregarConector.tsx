"use client";

import { useState } from "react";
import { Button } from "../ui/Button";
import type { ConectorCatalogo } from "./catalogo.ts";
import { agregarConectorAction } from "./actions";

// Drawer admin-only: lista los conectores del catalogo que aun NO estan agregados. Por cada
// uno, un mini form con el modo (default = modoSugerido) que dispara agregarConectorAction.
// El open/close es estado de cliente; el submit es un server action.
export function AgregarConector({ disponibles }: { disponibles: ConectorCatalogo[] }) {
  const [abierto, setAbierto] = useState(false);

  if (disponibles.length === 0) return null;

  return (
    <div className="mt-2">
      <Button type="button" onClick={() => setAbierto((v) => !v)}>
        {abierto ? "Cerrar" : "Agregar conector"}
      </Button>

      {abierto && (
        <div className="mt-4 flex flex-col gap-2.5 rounded-lg border border-line bg-surface p-3">
          {disponibles.map((cat) => (
            <form
              key={cat.id}
              action={agregarConectorAction}
              className="flex flex-col gap-3 rounded-md border border-line bg-bg p-3.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <input type="hidden" name="proveedor" value={cat.id} />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink">{cat.nombre}</div>
                <div className="max-w-md text-xs text-muted">{cat.descripcion}</div>
              </div>
              <div className="flex flex-none items-center gap-2">
                <select
                  name="modo"
                  defaultValue={cat.modoSugerido}
                  className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="personal">Personal</option>
                  <option value="admin">Equipo</option>
                </select>
                <Button type="submit">Agregar</Button>
              </div>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
