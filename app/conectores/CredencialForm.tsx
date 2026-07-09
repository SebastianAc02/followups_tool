"use client";

import { useActionState } from "react";
import { Button } from "../ui/Button";
import { guardarCredencialAction, type ResultadoGuardado } from "./actions";

// Unica parte de ConectorRow que necesita ser cliente: useActionState expone el resultado
// del server action (ok/error) para mostrar el motivo en vez de fallar en silencio, por
// ejemplo al apretar "Guardar" sin haber pegado ninguna credencial.
export function CredencialForm({ proveedor, tieneCredencial }: { proveedor: string; tieneCredencial: boolean }) {
  const [resultado, accion, pendiente] = useActionState<ResultadoGuardado | null, FormData>(
    guardarCredencialAction,
    null,
  );

  return (
    <div className="max-w-sm">
      <form action={accion} className="flex items-center gap-2">
        <input type="hidden" name="proveedor" value={proveedor} />
        <input
          name="credencial"
          type="password"
          autoComplete="off"
          placeholder={tieneCredencial ? "Reemplazar credencial" : "Pega tu credencial"}
          className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2.5 font-mono-tag text-sm text-ink outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" disabled={pendiente}>
          {tieneCredencial ? "Reemplazar" : "Conectar"}
        </Button>
      </form>
      {resultado && !resultado.ok && (
        <p className="mt-2 text-xs text-overdue">{resultado.error}</p>
      )}
    </div>
  );
}
