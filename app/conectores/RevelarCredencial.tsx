"use client";

import { useState, useTransition } from "react";
import { Button } from "../ui/Button";
import { revelarCredencialAction } from "./actions";

export function RevelarCredencial({ proveedor }: { proveedor: string }) {
  const [valor, setValor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciarTransicion] = useTransition();

  function revelar() {
    setError(null);
    iniciarTransicion(async () => {
      const resultado = await revelarCredencialAction(proveedor);
      if (resultado.ok) setValor(resultado.credencial);
      else setError(resultado.error);
    });
  }

  if (valor !== null) {
    return (
      <div className="mt-2 max-w-sm">
        <code className="block break-all rounded-lg border border-line bg-surface px-3 py-2.5 font-mono-tag text-xs text-ink">
          {valor}
        </code>
        <button type="button" onClick={() => setValor(null)} className="mt-1 text-xs text-muted underline">
          Ocultar
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <Button type="button" variant="quiet" onClick={revelar} disabled={pendiente}>
        {pendiente ? "Revelando..." : "Revelar"}
      </Button>
      {error && <p className="mt-1 text-xs text-overdue">{error}</p>}
    </div>
  );
}
