"use client";

import { useMemo, useState } from "react";
import type { ContextoToque, VersionDePaso } from "../../db/repository";
import { resaltarVariables } from "../../core/personalizar-copy";
import { enviarToqueCanalAction, registrarToqueSueltoAction } from "./actions";
import { ProximoToque } from "./ProximoToque";
import { plusDias } from "../../lib/date-utils";

// Toque 3 (mockup "Message WPP Toque 3"), RECORTADO a v1 por decision explicita del plan:
// composer de una linea + grilla "TUS VERSIONES DE ESTE TOQUE" (solo versionesDePaso).
//
// NO CONSTRUIDO A PROPOSITO (diferido a la fase de scoring, ver planning/plan-toques-ui-
// redesign.md, seccion "Fuera de alcance"): los tabs "Mejor respuesta / Recientes / Mias",
// el % de respuesta junto a cada version, y las tarjetas de OTROS usuarios (Maria Paz,
// Diego, Julian en el mockup). Eso requiere una libreria de versiones cross-usuario y un
// modelo de scoring que no existe hoy -- `versionesDePaso` solo trae las versiones A/B/C
// del PASO (no separa "de quien" son ni trae metricas de respuesta). Cuando exista ese
// dominio, esta grilla se extiende; no se aproxima aqui con datos falsos.

function datosVariables(ctx: ContextoToque): Record<string, string> {
  const datos: Record<string, string> = {};
  if (ctx.principal?.nombre) datos.nombre = ctx.principal.nombre;
  if (ctx.emp?.nombre) datos.empresa = ctx.emp.nombre;
  return datos;
}

function fechaCorta(fecha: string | null): string {
  if (!fecha) return "";
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return fecha;
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

function CopyResaltado({ texto, datos }: { texto: string; datos: Record<string, string> }) {
  const segmentos = resaltarVariables(texto, datos);
  return (
    <>
      {segmentos.map((s, i) =>
        s.esVariable ? (
          <mark
            key={i}
            className={
              s.resuelta
                ? "rounded bg-accent-whatsapp-soft px-1 text-accent-whatsapp"
                : "rounded bg-pending-soft px-1 text-pending"
            }
          >
            {s.texto}
          </mark>
        ) : (
          <span key={i}>{s.texto}</span>
        ),
      )}
    </>
  );
}

export function EditorWhatsapp({
  ctx,
  idEmpresa,
  dia,
  versiones,
  idPasoInscripcion,
}: {
  ctx: ContextoToque;
  idEmpresa: string;
  dia: number | null;
  versiones: VersionDePaso[];
  idPasoInscripcion: number | null;
}) {
  const defaultVersion = versiones[0] ?? null;
  const [idVersionActiva, setIdVersionActiva] = useState<number | null>(defaultVersion?.idVersion ?? null);
  const [cuerpo, setCuerpo] = useState(defaultVersion?.cuerpo ?? "");
  const [fecha, setFecha] = useState(plusDias(3));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const datos = useMemo(() => datosVariables(ctx), [ctx]);

  function reusar(v: VersionDePaso) {
    setIdVersionActiva(v.idVersion);
    setCuerpo(v.cuerpo ?? "");
  }

  async function enviar() {
    setEnviando(true);
    setError(null);
    if (idPasoInscripcion != null) {
      const resultado = await enviarToqueCanalAction(idEmpresa, idPasoInscripcion, cuerpo);
      if (resultado && !resultado.ok) {
        setError(resultado.error);
        setEnviando(false);
      }
    } else {
      await registrarToqueSueltoAction(idEmpresa, "whatsapp", cuerpo, fecha);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-shell">
      {/* Title bar */}
      <div className="flex items-center justify-between border-b border-line bg-shell-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-whatsapp" aria-hidden="true">
            <path d="M21 11.5a8.4 8.4 0 0 1-12 7.6L3 21l1.9-5.6A8.4 8.4 0 1 1 21 11.5z" />
          </svg>
          <span className="font-toque-heading text-sm font-semibold text-ink">Personalizar mensaje</span>
        </div>
        <span className="rounded border border-accent-whatsapp/25 bg-accent-whatsapp-soft px-2 py-0.5 font-toque-mono text-xs font-medium text-accent-whatsapp">
          {dia != null ? `DÍA ${dia}` : "SUELTO"}
        </span>
      </div>

      {/* Composer */}
      <div className="border-b border-line bg-shell-2 px-4 py-3.5">
        <div className="mb-2 rounded-lg border-2 border-accent-whatsapp/40 bg-surface p-3 text-[13px] leading-relaxed text-ink-soft">
          <CopyResaltado texto={cuerpo} datos={datos} />
        </div>
        <div className="flex items-end gap-2.5">
          <textarea
            rows={5}
            value={cuerpo}
            onChange={(e) => setCuerpo(e.target.value)}
            placeholder="Escribe tu mensaje..."
            className="min-h-[120px] flex-1 resize-y rounded-lg border border-line bg-hover px-3 py-2 text-[13px] leading-relaxed text-ink outline-none placeholder:text-faint focus:border-line-strong"
          />
          <button
            type="button"
            onClick={enviar}
            disabled={enviando || !cuerpo.trim()}
            className="flex-none rounded-lg bg-accent-whatsapp px-3.5 py-2 text-xs font-semibold text-ink transition-colors hover:opacity-90 disabled:opacity-55"
          >
            {enviando ? "Enviando..." : "Enviar"}
          </button>
        </div>
        {idPasoInscripcion == null && (
          <div className="mt-3">
            <ProximoToque fecha={fecha} onChange={setFecha} accentClase="border-accent-whatsapp bg-accent-whatsapp-soft text-ink" />
          </div>
        )}
        {error && <p className="mt-1.5 text-[12.5px] text-overdue">{error}</p>}
      </div>

      {/* Tus versiones */}
      <div className="bg-shell px-4 py-3.5">
        <div className="mb-3 font-toque-mono text-xs font-semibold uppercase tracking-widest text-muted">
          Tus versiones de este toque
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {versiones.length === 0 && <p className="text-xs text-faint">Sin versiones guardadas.</p>}
          {versiones.map((v) => {
            const activa = v.idVersion === idVersionActiva;
            return (
              <div
                key={v.idVersion}
                className={
                  activa
                    ? "rounded-xl border border-accent-whatsapp/40 bg-surface p-3"
                    : "rounded-xl border border-line bg-surface p-3"
                }
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="font-toque-mono text-xs font-semibold text-ink">{v.nombre ?? "—"}</span>
                  {activa ? (
                    <span className="text-xs font-semibold text-accent-whatsapp">en edición</span>
                  ) : (
                    <span className="font-toque-mono text-xs text-muted">{fechaCorta(v.fecha)}</span>
                  )}
                </div>
                <p className="mb-2 text-xs leading-snug text-muted">{v.cuerpo ?? "Sin contenido"}</p>
                {!activa && (
                  <button
                    type="button"
                    onClick={() => reusar(v)}
                    className="font-toque-mono text-xs font-semibold text-accent-whatsapp transition-colors hover:opacity-80"
                  >
                    Reusar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default EditorWhatsapp;
