"use client";

import { useState } from "react";
import { registrarToqueAction, estructurarDictadoAction } from "./actions";
import { RESULTADO_LABELS, RESULTADOS, type Resultado } from "../../db/validation";
import { plusDias } from "../../lib/date-utils";
import type { ToqueEstructurado } from "../../core/estructurar-toque";

const OUTCOMES: { v: Resultado; l: string }[] = RESULTADOS.map((v) => ({ v, l: RESULTADO_LABELS[v] }));
const CHIPS: [string, number][] = [["+1d", 1], ["+3d", 3], ["+1sem", 7]];

// Reemplaza CaptureForm.tsx: mismo submit (registrarToqueAction), pero antes del envío
// el owner puede pegar su dictado (texto del TTS externo, nunca audio) y pedir que la IA
// lo estructure en un borrador editable -- el owner siempre corrige antes de guardar.
export default function CapturaLlamada({ idEmpresa }: { idEmpresa: string }) {
  const [outcome, setOutcome] = useState<Resultado | "">("");
  const [fecha, setFecha] = useState(plusDias(3));
  const [dictado, setDictado] = useState("");
  const [estructurando, setEstructurando] = useState(false);
  const [borrador, setBorrador] = useState<ToqueEstructurado | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function estructurar() {
    setEstructurando(true);
    setError(null);
    try {
      const r = await estructurarDictadoAction(dictado);
      setBorrador(r);
      if (r.resultado) setOutcome(r.resultado);
      if (r.proximoFollowUp) setFecha(r.proximoFollowUp);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo estructurar el dictado");
    } finally {
      setEstructurando(false);
    }
  }

  return (
    <form action={registrarToqueAction} className="capture">
      <input type="hidden" name="idEmpresa" value={idEmpresa} />
      <input type="hidden" name="resultado" value={outcome} />
      <input type="hidden" name="toqueCanal" value="llamada" />
      <input type="hidden" name="canal" value="llamada" />

      <div className="section-label font-toque-mono">Pega tu resumen dictado</div>
      <textarea
        className="w-full rounded border border-line bg-surface p-2 text-sm"
        rows={3}
        placeholder="Pega aquí lo que dictaste al colgar..."
        value={dictado}
        onChange={(e) => setDictado(e.target.value)}
      />
      <button type="button" className="save" disabled={estructurando || !dictado.trim()} onClick={estructurar}>
        {estructurando ? "Estructurando..." : "Estructurar"}
      </button>
      {error && <p className="text-sm text-overdue">{error}</p>}

      <div className="section-label">Resultado</div>
      <div className="outcomes2 outcomes4">
        {OUTCOMES.map((o) => (
          <button type="button" key={o.v} className={`oc2 ${outcome === o.v ? "on" : ""}`} onClick={() => setOutcome(o.v)}>
            {o.l}
          </button>
        ))}
      </div>

      {outcome && (
        <div className="reveal">
          <div className="grid3">
            <label>Usuarios<input name="usuarios" type="number" inputMode="numeric" placeholder="—" defaultValue={borrador?.usuarios ?? undefined} /></label>
            <label>CRM<input name="crm" placeholder="—" defaultValue={borrador?.crm ?? undefined} /></label>
            <label>Pasarela<input name="pasarela" placeholder="—" defaultValue={borrador?.pasarela ?? undefined} /></label>
          </div>
          <label className="full">
            Qué pasó
            <textarea name="quePaso" rows={2} placeholder="En una línea, para que cualquiera lo entienda" defaultValue={borrador?.quePaso ?? ""} />
          </label>

          {outcome === "contesto_no" && (
            <label className="full">Razón de pérdida<input name="razonPerdida" placeholder="Precio, timing, sin presupuesto..." required /></label>
          )}

          <div className="section-label">Próximo toque</div>
          <div className="chips">
            {CHIPS.map(([l, d]) => (
              <button type="button" key={l} className={`chip ${fecha === plusDias(d) ? "on" : ""}`} onClick={() => setFecha(plusDias(d))}>
                {l}
              </button>
            ))}
            <input type="date" name="fecha" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>

          <button type="submit" className="save">Guardar y confirmar</button>
        </div>
      )}
    </form>
  );
}
