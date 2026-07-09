"use client";

import { useState } from "react";
import { registrarToqueAction, estructurarDictadoAction } from "./actions";
import { RESULTADO_LABELS, RESULTADOS, RESULTADOS_CONTESTO, type Resultado } from "../../db/validation";
import { plusDias } from "../../lib/date-utils";
import type { ToqueEstructurado } from "../../core/estructurar-toque";
import type { Calificacion } from "../../core/calificacion";

const OUTCOMES: { v: Resultado; l: string }[] = RESULTADOS.map((v) => ({ v, l: RESULTADO_LABELS[v] }));
const CHIPS: [string, number][] = [["+1d", 1], ["+3d", 3], ["+1sem", 7]];

const inputClase =
  "w-full rounded-lg border border-line bg-shell px-2.5 py-2 text-[13px] text-ink placeholder:text-faint outline-none focus:border-accent-llamada";

// Reemplaza CaptureForm.tsx: mismo submit (registrarToqueAction), pero antes del envío
// el owner puede pegar su resumen (texto -- hoy pegado a mano, manana probablemente
// texto-a-voz externo, nunca audio en la app) y pedir que la IA lo estructure en un
// borrador editable -- el owner siempre corrige antes de guardar. Todo tokens: cero
// clases legacy (.capture/.oc2/.reveal), para no desentonar con el resto de la tarjeta.
export default function CapturaLlamada({
  idEmpresa,
  idPasoInscripcion,
  calificacion,
}: {
  idEmpresa: string;
  // Sesion 2026-07-09: paso_inscripcion pendiente de HOY si esta llamada viene de una
  // cadencia (mismo patron que EditorCorreo/EditorWhatsapp) -- registrarToqueAction lo
  // usa para cerrar el paso con la fecha REAL una vez que el toque ya quedo guardado
  // con su resultado. null en un toque suelto (sin cadencia activa).
  idPasoInscripcion: number | null;
  // Con qué de usuarios/CRM/pasarela ya cuenta la cuenta (2026-07-08): el form solo
  // pide lo que el checklist de arriba marca "preguntar" -- antes repetía los tres
  // campos siempre, aunque ya estuvieran guardados. Sin esto, no rompe: simplemente
  // vuelve a preguntar todo (comportamiento anterior).
  calificacion?: Calificacion;
}) {
  const [outcome, setOutcome] = useState<Resultado | "">("");
  const [fecha, setFecha] = useState(plusDias(3));
  const [dictado, setDictado] = useState("");
  const [estructurando, setEstructurando] = useState(false);
  const [borrador, setBorrador] = useState<ToqueEstructurado | null>(null);
  const [error, setError] = useState<string | null>(null);

  const yaTengo = new Set(
    (calificacion?.items ?? []).filter((i) => i.estado === "tengo").map((i) => i.campo),
  );
  // no_contesto: nunca hubo conversación, nada que calificar ni que resumir (mismo
  // criterio que RESULTADOS_CONTESTO ya usa para decidir si buscar en Granola).
  const huboConversacion = outcome !== "" && RESULTADOS_CONTESTO.includes(outcome);
  const pideUsuarios = huboConversacion && !yaTengo.has("usuarios");
  const pideCrm = huboConversacion && !yaTengo.has("crm");
  const pidePasarela = huboConversacion && !yaTengo.has("pasarela");
  const pideDatosCuenta = pideUsuarios || pideCrm || pidePasarela;

  async function estructurar() {
    setEstructurando(true);
    setError(null);
    try {
      const r = await estructurarDictadoAction(dictado);
      setBorrador(r);
      if (r.resultado) setOutcome(r.resultado);
      if (r.proximoFollowUp) setFecha(r.proximoFollowUp);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo estructurar el resumen");
    } finally {
      setEstructurando(false);
    }
  }

  return (
    <form
      action={registrarToqueAction}
      className="flex flex-col gap-4 rounded-xl border border-line bg-shell-2 p-4"
    >
      <input type="hidden" name="idEmpresa" value={idEmpresa} />
      <input type="hidden" name="resultado" value={outcome} />
      <input type="hidden" name="toqueCanal" value="llamada" />
      <input type="hidden" name="canal" value="llamada" />
      {idPasoInscripcion != null && <input type="hidden" name="idPasoInscripcion" value={idPasoInscripcion} />}

      {/* Resumen + estructurar: no tiene sentido dictar un resumen de una llamada que no
          se contestó -- nunca hubo conversación que resumir. */}
      {outcome !== "no_contesto" && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-accent-llamada-soft text-accent-llamada">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
                <path d="M19 11a7 7 0 0 1-14 0M12 18v3" strokeLinecap="round" />
              </svg>
            </span>
            <span className="font-toque-heading text-[13px] text-ink">Tu resumen</span>
          </div>
          <textarea
            className={`${inputClase} resize-none`}
            rows={3}
            placeholder="Que paso en la llamada..."
            value={dictado}
            onChange={(e) => setDictado(e.target.value)}
            disabled={estructurando}
          />

          {estructurando ? (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-accent-llamada bg-accent-llamada-soft px-3 py-2">
              <span className="h-3 w-3 flex-none animate-spin rounded-full border-2 border-accent-llamada border-t-transparent" />
              <span className="font-toque-mono text-[11.5px] text-accent-llamada">Estructurando tu resumen...</span>
            </div>
          ) : (
            <button
              type="button"
              className="mt-2 rounded-lg bg-accent-llamada px-3.5 py-1.5 text-[12.5px] font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-40"
              disabled={!dictado.trim()}
              onClick={estructurar}
            >
              Estructurar con IA
            </button>
          )}
          {error && <p className="mt-2 text-[12px] text-overdue">{error}</p>}
        </div>
      )}

      {/* Resultado */}
      <div>
        <div className="mb-2 font-toque-mono text-[10.5px] uppercase tracking-wide text-faint">Resultado</div>
        <div className="flex flex-wrap gap-1.5">
          {OUTCOMES.map((o) => (
            <button
              type="button"
              key={o.v}
              onClick={() => setOutcome(o.v)}
              className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                outcome === o.v
                  ? "border-accent-llamada bg-accent-llamada-soft text-ink"
                  : "border-line bg-shell text-muted hover:border-line-strong"
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>

      {outcome && (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          {/* Solo pide lo que el checklist de arriba marca "preguntar" -- si ya tiene
              usuarios/CRM/pasarela, no vuelve a preguntarlos. Nada de esto (ni "Qué
              pasó") aplica si no contestó: no hubo conversación que calificar. */}
          {pideDatosCuenta && (
            <div className="grid grid-cols-3 gap-2">
              {pideUsuarios && (
                <label className="flex flex-col gap-1">
                  <span className="font-toque-mono text-[9.5px] uppercase tracking-wide text-faint">Usuarios</span>
                  <input
                    name="usuarios"
                    type="number"
                    inputMode="numeric"
                    placeholder="—"
                    defaultValue={borrador?.usuarios ?? undefined}
                    className={inputClase}
                  />
                </label>
              )}
              {pideCrm && (
                <label className="flex flex-col gap-1">
                  <span className="font-toque-mono text-[9.5px] uppercase tracking-wide text-faint">CRM</span>
                  <input name="crm" placeholder="—" defaultValue={borrador?.crm ?? undefined} className={inputClase} />
                </label>
              )}
              {pidePasarela && (
                <label className="flex flex-col gap-1">
                  <span className="font-toque-mono text-[9.5px] uppercase tracking-wide text-faint">Pasarela</span>
                  <input
                    name="pasarela"
                    placeholder="—"
                    defaultValue={borrador?.pasarela ?? undefined}
                    className={inputClase}
                  />
                </label>
              )}
            </div>
          )}

          {huboConversacion && (
            <label className="flex flex-col gap-1">
              <span className="font-toque-mono text-[9.5px] uppercase tracking-wide text-faint">Qué pasó</span>
              <textarea
                name="quePaso"
                rows={2}
                placeholder="En una línea, para que cualquiera lo entienda"
                defaultValue={borrador?.quePaso ?? ""}
                className={`${inputClase} resize-none`}
              />
            </label>
          )}

          {outcome === "contesto_no" && (
            <label className="flex flex-col gap-1">
              <span className="font-toque-mono text-[9.5px] uppercase tracking-wide text-faint">Razón de pérdida</span>
              <input name="razonPerdida" placeholder="Precio, timing, sin presupuesto..." required className={inputClase} />
            </label>
          )}

          <div>
            <div className="mb-2 font-toque-mono text-[10.5px] uppercase tracking-wide text-faint">Próximo toque</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {CHIPS.map(([l, d]) => (
                <button
                  type="button"
                  key={l}
                  onClick={() => setFecha(plusDias(d))}
                  className={`rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${
                    fecha === plusDias(d)
                      ? "border-accent-llamada bg-accent-llamada-soft text-ink"
                      : "border-line text-muted hover:border-line-strong"
                  }`}
                >
                  {l}
                </button>
              ))}
              <input
                type="date"
                name="fecha"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="rounded-lg border border-line bg-shell px-2 py-1 text-[12px] text-ink"
              />
            </div>
          </div>

          <button
            type="submit"
            className="rounded-lg bg-accent-llamada px-4 py-2 text-[12.5px] font-semibold text-ink transition-opacity hover:opacity-90"
          >
            Guardar y confirmar
          </button>
        </div>
      )}
    </form>
  );
}
