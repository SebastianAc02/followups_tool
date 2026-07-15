"use client";

import { useState, useTransition } from "react";
import { Button } from "../ui/Button";
import { useConfirm } from "../ui/useConfirm";
import { quitarConectorAction } from "./actions";

// ConectorRow es server component: el boton con confirmacion tiene que vivir aca. Mismo
// patron que CampanaCard (useConfirm + startTransition + accion con resultado).
// Dos acciones, no una (decision 2026-07-15): "Quitar" a secas mentia -- dejaba el secreto
// en la DB, y re-agregar revivia el conector ya conectado.
export function QuitarConector({ proveedor, nombre }: { proveedor: string; nombre: string }) {
  const { confirmar, elemento: dialogo } = useConfirm();
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState("");

  async function ejecutar(borrarCredencial: boolean) {
    const ok = await confirmar(
      borrarCredencial
        ? {
            titulo: `¿Quitar ${nombre} y borrar su credencial?`,
            mensaje: `Se borra la credencial guardada. Para volver a usar ${nombre} hay que conectarlo desde cero. No se puede deshacer.`,
            textoConfirmar: "Quitar y borrar",
          }
        : {
            titulo: `¿Desactivar ${nombre}?`,
            mensaje:
              "Deja de aparecer en /conectores para todo el equipo. La credencial se conserva: volver a agregarlo lo revive sin reconectar.",
            textoConfirmar: "Desactivar",
            destructivo: false,
          },
    );
    if (!ok) return;
    setError("");
    startTransition(async () => {
      const res = await quitarConectorAction(proveedor, borrarCredencial);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <>
      <Button type="button" variant="quiet" onClick={() => ejecutar(false)} disabled={pendiente}>
        Desactivar
      </Button>
      <Button
        type="button"
        variant="quiet"
        onClick={() => ejecutar(true)}
        disabled={pendiente}
        className="text-overdue/80 hover:text-overdue"
      >
        Quitar y borrar credencial
      </Button>
      {error && <p className="mt-1 w-full text-xs text-overdue">{error}</p>}
      {dialogo}
    </>
  );
}
