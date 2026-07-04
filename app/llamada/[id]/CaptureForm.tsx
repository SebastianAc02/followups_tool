"use client";

import { useState } from "react";
import { registrarToqueAction } from "./actions";

// Puente temporal: el formulario viejo (2 salidas) todavía no distingue reunión de
// seguimiento (eso es V1.3). "contesto" mapea al valor mas honesto disponible hoy en el
// enum cerrado de 4 salidas: contesto_no. V1.3 reemplaza esto con las 4 salidas reales.
const OUTCOMES = [
  { v: "contesto_no", l: "Contestó" },
  { v: "no_contesto", l: "No contestó" },
];

const CANALES = [
  { v: "llamada", l: "Llamada" },
  { v: "whatsapp", l: "WhatsApp" },
  { v: "correo", l: "Correo" },
];

const CHIPS: [string, number][] = [["+1d", 1], ["+3d", 3], ["+1sem", 7]];

function plus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function CaptureForm({ idEmpresa }: { idEmpresa: string }) {
  const [outcome, setOutcome] = useState("");
  const [fecha, setFecha] = useState(plus(3));
  const [canal, setCanal] = useState("llamada");

  function pick(v: string) {
    setOutcome(v);
    setFecha(plus(v === "no_contesto" ? 1 : 5));
    if (v === "no_contesto") setCanal("whatsapp");
  }

  return (
    <form action={registrarToqueAction} className="capture">
      <input type="hidden" name="idEmpresa" value={idEmpresa} />
      <input type="hidden" name="resultado" value={outcome} />
      <input type="hidden" name="canal" value={canal} />

      <div className="outcomes2">
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

          <div className="section-label">Próximo toque</div>
          <div className="seg">
            {CANALES.map((c) => (
              <button type="button" key={c.v} className={`seg-btn ${canal === c.v ? "on" : ""}`} onClick={() => setCanal(c.v)}>
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
