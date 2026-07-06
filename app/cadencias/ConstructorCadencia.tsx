"use client";

import { useMemo, useState } from "react";
import { calcularCalendario, type ConfigCalendario } from "../core/motor-cadencia";
import { diaSemana } from "../lib/date-utils";

// V4.7: el constructor corre el motor EN EL CLIENTE (motor-cadencia es puro), asi que
// bloquear un dia o cambiar el corrimiento recalcula el calendario al instante, sin
// round-trip. El anchor (hoy) llega del servidor como prop para no romper la hidratacion.

export type PasoUI = { orden: number; diaOffset: number; canal: string; asunto: string | null };

const DIAS_CORTO = ["D", "L", "M", "M", "J", "V", "S"];
const DIAS_LARGO = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function diaRelativo(fecha: string, anchor: string): number {
  return Math.round((Date.parse(fecha) - Date.parse(anchor)) / 86400000);
}

export default function ConstructorCadencia({ nombre, pasos, anchor }: { nombre: string; pasos: PasoUI[]; anchor: string }) {
  const [bloqueados, setBloqueados] = useState<number[]>([0]); // domingo bloqueado por defecto
  const [corrimiento, setCorrimiento] = useState<"siguiente" | "anterior">("siguiente");

  const asuntoPorOrden = useMemo(() => new Map(pasos.map((p) => [p.orden, p])), [pasos]);

  const cal = useMemo(() => {
    const config: ConfigCalendario = { diasBloqueados: bloqueados, corrimiento };
    try {
      return { filas: calcularCalendario(pasos.map((p) => ({ orden: p.orden, diaOffset: p.diaOffset })), anchor, config), error: "" };
    } catch (e) {
      return { filas: [], error: e instanceof Error ? e.message : "error" };
    }
  }, [pasos, anchor, bloqueados, corrimiento]);

  // Agrupa por fecha final (varios toques pueden caer el mismo dia).
  const dias = useMemo(() => {
    const map = new Map<string, { fecha: string; filas: typeof cal.filas }>();
    for (const f of cal.filas) {
      if (!map.has(f.fecha)) map.set(f.fecha, { fecha: f.fecha, filas: [] });
      map.get(f.fecha)!.filas.push(f);
    }
    return [...map.values()].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  }, [cal]);

  const toggleBloqueado = (d: number) => setBloqueados((b) => (b.includes(d) ? b.filter((x) => x !== d) : [...b, d]));

  return (
    <div className="cad-constructor">
      <div className="section-label">Constructor · {nombre}</div>

      <div className="cad-config">
        <div className="cad-config-block">
          <span className="cad-config-label">Días sin envío</span>
          <div className="chips">
            {DIAS_CORTO.map((d, i) => (
              <button key={i} type="button" className={`chip ${bloqueados.includes(i) ? "on" : ""}`} onClick={() => toggleBloqueado(i)} title={DIAS_LARGO[i]}>
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className="cad-config-block">
          <span className="cad-config-label">Si un toque cae en día bloqueado</span>
          <div className="seg">
            <button type="button" className={`seg-btn ${corrimiento === "anterior" ? "on" : ""}`} onClick={() => setCorrimiento("anterior")}>
              día anterior
            </button>
            <button type="button" className={`seg-btn ${corrimiento === "siguiente" ? "on" : ""}`} onClick={() => setCorrimiento("siguiente")}>
              día siguiente
            </button>
          </div>
        </div>
      </div>

      <div className="cad-preview-head">Así se ve la cadencia en acción</div>
      {cal.error ? (
        <p className="login-error">{cal.error}</p>
      ) : (
        <div className="cad-timeline">
          {dias.map((dia) => (
            <div key={dia.fecha} className="cad-day">
              <div className="cad-day-left">
                <div className="cad-day-num mono">día {diaRelativo(dia.fecha, anchor)}</div>
                <div className="cad-day-fecha mono">{dia.fecha.slice(5)}</div>
                <div className="cad-day-dow">{DIAS_LARGO[diaSemana(dia.fecha)]}</div>
              </div>
              <div className="cad-day-touches">
                {dia.filas.map((f) => {
                  const paso = asuntoPorOrden.get(f.orden);
                  const corrido = f.fecha !== f.fechaNatural;
                  return (
                    <div key={f.orden} className="cad-touch">
                      <span className={`cad-canal cad-canal-${paso?.canal ?? "otro"}`}>{paso?.canal ?? "?"}</span>
                      <span className="cad-touch-asunto">{paso?.asunto || "(sin asunto)"}</span>
                      {corrido && <span className="cad-touch-shift">corrido de {DIAS_LARGO[diaSemana(f.fechaNatural)]}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="cad-preview-meta">
        {cal.filas.length} toques en {dias.length} días · del día 0 al día {cal.filas.reduce((m, f) => Math.max(m, f.diaOffset), 0)}
      </p>
    </div>
  );
}
