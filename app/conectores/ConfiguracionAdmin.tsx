"use client";

import { useActionState } from "react";
import { Button } from "../ui/Button";
import { guardarConfiguracionAction, type ResultadoGuardado } from "./actions";
import type { ConfiguracionCatalogo } from "./catalogo.ts";

// A diferencia de CredencialForm: el valor NO es secreto (no pasa por cifrar/descifrar),
// asi que se muestra directo en el input -- no hay boton "Revelar" ni type="password".
export function ConfiguracionAdmin({ cat, valor }: { cat: ConfiguracionCatalogo; valor: string | null }) {
  const [resultado, accion, pendiente] = useActionState<ResultadoGuardado | null, FormData>(
    guardarConfiguracionAction,
    null,
  );

  return (
    <div className="rounded-md border border-line bg-bg p-3.5">
      <div className="mb-2">
        <div className="text-sm font-semibold text-ink">{cat.etiqueta}</div>
        <div className="max-w-md text-xs text-muted">{cat.descripcion}</div>
      </div>
      <form action={accion} className="flex max-w-sm items-center gap-2">
        <input type="hidden" name="clave" value={cat.clave} />
        <input
          name="valor"
          type="text"
          autoComplete="off"
          defaultValue={valor ?? ""}
          placeholder="Sin configurar"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2.5 font-mono-tag text-sm text-ink outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" disabled={pendiente}>
          Guardar
        </Button>
      </form>
      {resultado && !resultado.ok && <p className="mt-2 text-xs text-overdue">{resultado.error}</p>}
    </div>
  );
}
