"use client";

import { useState, useTransition } from "react";
import { Button } from "../ui/Button";
import { verificarGranolaAction, type ResultadoVerificacionGranola } from "./actions";

const MENSAJE_ERROR: Record<"sin_llamadas" | "error_interno", string> = {
  sin_llamadas: "Todavía no tienes ninguna llamada grabada en Granola. Cuando tengas una, vuelve a intentar.",
  error_interno: "Hubo un error, ya le avisamos al admin para que lo revise.",
};

export function VerificarGranola({ tieneCredencial }: { tieneCredencial: boolean }) {
  const [credencial, setCredencial] = useState("");
  const [resultado, setResultado] = useState<ResultadoVerificacionGranola | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const [pendiente, iniciarTransicion] = useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!credencial.trim()) return;
    iniciarTransicion(async () => {
      const r = await verificarGranolaAction(credencial.trim());
      setResultado(r);
      setConfirmado(false);
    });
  }

  if (resultado?.ok && !confirmado) {
    return (
      <div className="max-w-sm rounded-lg border border-line bg-surface p-4 text-sm">
        <p className="mb-1 text-xs uppercase tracking-widest text-muted">Tu última llamada</p>
        <p className="font-medium text-ink">{resultado.nota.titulo ?? "(sin título)"}</p>
        <p className="mb-2 text-xs text-muted">{resultado.nota.fecha.slice(0, 16).replace("T", " ")}</p>
        {resultado.nota.resumenCorto && <p className="mb-3 text-muted">{resultado.nota.resumenCorto}…</p>}
        <div className="flex gap-2">
          <Button type="button" onClick={() => setConfirmado(true)}>Sí, es la mía</Button>
          <Button type="button" variant="quiet" onClick={() => setResultado(null)}>No es la mía</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-sm">
      <form onSubmit={enviar} className="flex items-center gap-2">
        <input
          value={credencial}
          onChange={(e) => setCredencial(e.target.value)}
          type="password"
          autoComplete="off"
          placeholder={tieneCredencial || confirmado ? "Reemplazar credencial" : "Pega tu credencial"}
          className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2.5 font-mono-tag text-sm text-ink outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" disabled={pendiente}>{pendiente ? "Verificando..." : "Confirmar"}</Button>
      </form>
      {resultado && !resultado.ok && <p className="mt-2 text-xs text-overdue">{MENSAJE_ERROR[resultado.error]}</p>}
      {confirmado && <p className="mt-2 text-xs text-done">Configurado.</p>}
    </div>
  );
}
