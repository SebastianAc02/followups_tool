"use client";

import { useState } from "react";
import { buscarGrabacionAction, confirmarGrabacionAction } from "./actions";
import type { CandidataOFusion } from "../../core/matcher";

export default function BuscarGrabacion({ idEmpresa, idToque }: { idEmpresa: string; idToque: number }) {
  const [candidatas, setCandidatas] = useState<CandidataOFusion[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [confirmada, setConfirmada] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buscar() {
    setBuscando(true);
    setError(null);
    try {
      setCandidatas(await buscarGrabacionAction(idToque));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo buscar en Granola");
    } finally {
      setBuscando(false);
    }
  }

  async function confirmar(candidata: CandidataOFusion) {
    setConfirmando(candidata.transcriptId);
    try {
      await confirmarGrabacionAction(idEmpresa, idToque, candidata);
      setConfirmada(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo confirmar");
    } finally {
      setConfirmando(null);
    }
  }

  if (confirmada) {
    return <span className="tq-transcript-ok">Grabación confirmada</span>;
  }

  if (candidatas === null) {
    return (
      <div className="tq-candidatas">
        {error && <span className="tq-error">{error}</span>}
        <button type="button" className="tq-buscar" onClick={buscar} disabled={buscando}>
          {buscando ? "Buscando..." : "Buscar grabación"}
        </button>
      </div>
    );
  }

  if (candidatas.length === 0) {
    return (
      <div className="tq-candidatas">
        {error && <span className="tq-error">{error}</span>}
        <span className="tq-vacio">Todavía no aparece en Granola.</span>
        <button type="button" className="tq-buscar" onClick={buscar} disabled={buscando}>
          {buscando ? "Buscando..." : "Buscar de nuevo"}
        </button>
      </div>
    );
  }

  return (
    <div className="tq-candidatas">
      {error && <span className="tq-error">{error}</span>}
      {candidatas.map((c) => (
        <div key={c.transcriptId} className="tq-candidata">
          <div className="tq-candidata-info">
            <span className="tq-candidata-titulo">{c.titulo}</span>
            <span className="tq-candidata-fecha mono">{c.fecha.slice(0, 16).replace("T", " ")}</span>
          </div>
          <p className="tq-candidata-resumen">{c.resumen}</p>
          <button type="button" className="tq-confirmar" onClick={() => confirmar(c)} disabled={confirmando === c.transcriptId}>
            {confirmando === c.transcriptId ? "Confirmando..." : "Confirmar esta"}
          </button>
        </div>
      ))}
    </div>
  );
}
