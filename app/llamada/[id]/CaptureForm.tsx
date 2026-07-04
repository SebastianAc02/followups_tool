"use client";

import { useState } from "react";
import { registrarToqueAction } from "./actions";
import { RESULTADO_LABELS, RESULTADOS, type Resultado } from "../../db/validation";
import { plusDias } from "../../lib/date-utils";

const OUTCOMES: { v: Resultado; l: string }[] = RESULTADOS.map((v) => ({
  v,
  l: RESULTADO_LABELS[v],
}));

const CANALES = [
  { v: "llamada", l: "Llamada" },
  { v: "whatsapp", l: "WhatsApp" },
  { v: "correo", l: "Correo" },
];

const CHIPS: [string, number][] = [["+1d", 1], ["+3d", 3], ["+1sem", 7]];

const plus = plusDias;

export default function CaptureForm({ idEmpresa }: { idEmpresa: string }) {
  const [outcome, setOutcome] = useState<Resultado | "">("");
  const [fecha, setFecha] = useState(plus(3));
  const [proximoCanal, setProximoCanal] = useState("llamada");
  const [toqueCanal, setToqueCanal] = useState("llamada");

  function pick(v: Resultado) {
    setOutcome(v);
    setFecha(plus(v === "no_contesto" ? 1 : 5));
    if (v === "no_contesto") setProximoCanal("whatsapp");
  }

  return (
    <form action={registrarToqueAction} className="capture">
      <input type="hidden" name="idEmpresa" value={idEmpresa} />
      <input type="hidden" name="resultado" value={outcome} />
      <input type="hidden" name="canal" value={proximoCanal} />

      <div className="section-label">Canal de este toque</div>
      <div className="seg">
        {CANALES.map((c) => (
          <button type="button" key={c.v} className={`seg-btn ${toqueCanal === c.v ? "on" : ""}`} onClick={() => setToqueCanal(c.v)}>
            {c.l}
          </button>
        ))}
      </div>
      <input type="hidden" name="toqueCanal" value={toqueCanal} />

      <div className="outcomes2 outcomes4">
        {OUTCOMES.map((o) => (
          <button type="button" key={o.v} className={`oc2 ${outcome === o.v ? "on" : ""}`} onClick={() => pick(o.v)}>
            {o.l}
          </button>
        ))}
      </div>

      {outcome && (
        <div className="reveal">
          <div className="grid3">
            <label>Usuarios<input name="usuarios" type="number" inputMode="numeric" placeholder="—" /></label>
            <label>CRM<input name="crm" placeholder="—" /></label>
            <label>Pasarela<input name="pasarela" placeholder="—" /></label>
          </div>
          <label className="full">Qué pasó<textarea name="quePaso" rows={2} placeholder="En una línea, para que cualquiera lo entienda" /></label>

          {outcome === "contesto_no" && (
            <label className="full">Razón de pérdida<input name="razonPerdida" placeholder="Precio, timing, sin presupuesto..." required /></label>
          )}

          <label className="full">Objeción<input name="objecion" placeholder="Opcional" /></label>

          <div className="section-label">¿Te pasaron el contacto del gerente?</div>
          <div className="grid3 kdm-grid">
            <label>Nombre KDM<input name="kdmNombre" placeholder="Opcional" /></label>
            <label>Teléfono KDM<input name="kdmTelefono" placeholder="Opcional" /></label>
          </div>

          <div className="section-label">Próximo toque</div>
          <div className="seg">
            {CANALES.map((c) => (
              <button type="button" key={c.v} className={`seg-btn ${proximoCanal === c.v ? "on" : ""}`} onClick={() => setProximoCanal(c.v)}>
                {c.l}
              </button>
            ))}
          </div>
          <div className="chips">
            {CHIPS.map(([l, d]) => (
              <button type="button" key={l} className={`chip ${fecha === plus(d) ? "on" : ""}`} onClick={() => setFecha(plus(d))}>
                {l}
              </button>
            ))}
            <input type="date" name="fecha" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>

          <button type="submit" className="save">Guardar y siguiente</button>
        </div>
      )}
    </form>
  );
}
