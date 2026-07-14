"use client";

import { useMemo, useState } from "react";
import type { ContextoToque, VersionDePaso } from "../../db/repository";
import { resaltarVariables } from "../../core/personalizar-copy";
import { enviarToqueCanalAction, registrarToqueSueltoAction } from "./actions";

// Toque 2 (mockup "OnePay Email Editor Toque 2"): title bar + metadata strip + grid
// [1fr_216px] con el copy editable a la izquierda y la barra de versiones a la derecha.
// Es client component porque el owner edita asunto/cuerpo y cambia de version antes de
// mandar -- todo eso es estado de UI, no dominio.
//
// Persistencia: si hay `idPasoInscripcion` (toque de cadencia con paso manual pendiente),
// "Enviar correo" reusa enviarToqueCanalAction -> aprobarDesdeInboxAction, que guarda el
// CUERPO final en el historial (`toque.quePaso`) pero no el asunto -- aprobarPasoManual no
// tiene un campo para asunto hoy. Si no hay `idPasoInscripcion` (correo suelto, sin
// cadencia activa), se guarda via registrarToqueSueltoAction (registrarToque con canal
// 'correo'); ver ese archivo para la nota sobre que "resultado" se usa en ese caso.

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
                ? "rounded bg-accent-correo-soft px-1 text-accent-correo"
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

export function EditorCorreo({
  ctx,
  idEmpresa,
  dia,
  objetivo,
  versiones,
  idPasoInscripcion,
}: {
  ctx: ContextoToque;
  idEmpresa: string;
  dia: number | null;
  objetivo: string | null;
  versiones: VersionDePaso[];
  idPasoInscripcion: number | null;
}) {
  const defaultVersion = versiones[0] ?? null;
  const [idVersionActiva, setIdVersionActiva] = useState<number | null>(defaultVersion?.idVersion ?? null);
  const [asunto, setAsunto] = useState(defaultVersion?.asunto ?? "");
  const [cuerpo, setCuerpo] = useState(defaultVersion?.cuerpo ?? "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const datos = useMemo(() => datosVariables(ctx), [ctx]);
  const { emp } = ctx;

  function reusar(v: VersionDePaso) {
    setIdVersionActiva(v.idVersion);
    setAsunto(v.asunto ?? "");
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
      // exito: enviarToqueCanalAction redirige, este componente se desmonta.
    } else {
      await registrarToqueSueltoAction(idEmpresa, "correo", cuerpo, undefined);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-shell">
      {/* Title bar */}
      <div className="flex items-center justify-between border-b border-line bg-shell-2 px-4 py-3">
        <span className="font-toque-heading text-sm font-semibold text-ink">Personalizar correo</span>
        <span className="rounded border border-accent-correo/25 bg-accent-correo-soft px-2 py-0.5 font-toque-mono text-xs font-medium uppercase tracking-widest text-accent-correo">
          {dia != null ? `DÍA ${dia}` : "SUELTO"} · {objetivo ?? "Sin objetivo"}
        </span>
      </div>

      {/* Metadata strip */}
      <div className="flex items-center gap-3 overflow-x-auto border-b border-line bg-shell-2 px-4 py-2.5 text-xs whitespace-nowrap">
        <span className="font-semibold text-ink">{emp?.nombre ?? "Cuenta sin nombre"}</span>
        <span className="h-3 w-px shrink-0 bg-line" />
        <span className="text-muted">{emp?.ciudad ?? "—"}</span>
        <span className="h-3 w-px shrink-0 bg-line" />
        <span className="text-muted">
          Usuarios <b className="font-semibold text-ink">{emp?.usuarios != null ? Math.round(emp.usuarios).toLocaleString("es-CO") : "—"}</b>
        </span>
        <span className="h-3 w-px shrink-0 bg-line" />
        <span className="text-muted">
          Pasarela <b className="font-semibold text-ink">{emp?.pasarela ?? "—"}</b>
        </span>
        <span className="h-3 w-px shrink-0 bg-line" />
        <span className="text-muted">{emp?.estado ?? "—"}</span>
      </div>

      {/* Two column editor */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_216px]">
        <div className="border-b border-line p-4 md:border-b-0 md:border-r md:p-5">
          <div className="mb-1.5 text-xs text-muted">Asunto</div>
          <div className="mb-1.5 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink">
            <CopyResaltado texto={asunto} datos={datos} />
          </div>
          <input
            value={asunto}
            onChange={(e) => setAsunto(e.target.value)}
            placeholder="Asunto del correo..."
            className="mb-3 w-full rounded-lg border border-line bg-hover px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-line-strong"
          />

          <div className="mb-1.5 text-xs text-muted">Mensaje</div>
          <div className="mb-1.5 rounded-lg border-2 border-accent-correo/40 bg-surface p-3 text-xs leading-relaxed text-ink-soft">
            <CopyResaltado texto={cuerpo} datos={datos} />
          </div>
          <textarea
            rows={6}
            value={cuerpo}
            onChange={(e) => setCuerpo(e.target.value)}
            placeholder="Cuerpo del correo..."
            className="mb-4 min-h-[140px] w-full resize-y rounded-lg border border-line bg-hover px-3 py-2.5 text-[13px] leading-relaxed text-ink outline-none placeholder:text-faint focus:border-line-strong"
          />

          {error && <p className="mb-2 text-[12.5px] text-overdue">{error}</p>}

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={enviar}
              disabled={enviando || !cuerpo.trim()}
              className="rounded-lg bg-accent-correo px-4 py-2.5 text-xs font-semibold text-ink transition-colors hover:opacity-90 disabled:opacity-55"
            >
              {enviando ? "Enviando..." : "Enviar correo"}
            </button>
            <button
              type="button"
              disabled
              title="Guardar version nueva: fuera de alcance de esta tarea (ver version_paso / campanas)"
              className="cursor-not-allowed rounded-lg border border-line bg-shell-2 px-4 py-2.5 text-xs font-medium text-muted opacity-55"
            >
              Guardar versión
            </button>
          </div>
        </div>

        {/* Versions sidebar */}
        <div className="bg-surface p-4">
          <div className="mb-3 font-toque-mono text-xs font-semibold uppercase tracking-widest text-muted">
            Versiones de este toque
          </div>
          <div className="flex flex-col gap-2.5">
            {versiones.length === 0 && <p className="text-xs text-faint">Sin versiones guardadas.</p>}
            {versiones.map((v) => {
              const activa = v.idVersion === idVersionActiva;
              return (
                <div
                  key={v.idVersion}
                  className={
                    activa
                      ? "rounded-xl border-2 border-accent-correo/45 bg-shell p-3 shadow-sm"
                      : "rounded-xl border border-line bg-shell p-3"
                  }
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span
                      className={
                        activa
                          ? "rounded bg-accent-correo px-1.5 py-0.5 font-toque-mono text-xs font-bold text-ink"
                          : "rounded bg-shell-2 px-1.5 py-0.5 font-toque-mono text-xs font-bold text-ink"
                      }
                    >
                      {v.nombre ?? "—"}
                    </span>
                    {activa ? (
                      <span className="text-xs font-semibold text-accent-correo">en edición</span>
                    ) : (
                      <span className="text-xs text-muted">{fechaCorta(v.fecha)}</span>
                    )}
                  </div>
                  <div className="mb-2 text-xs leading-snug text-muted">{v.asunto ?? v.cuerpo ?? "Sin contenido"}</div>
                  {!activa && (
                    <button
                      type="button"
                      onClick={() => reusar(v)}
                      className="font-toque-mono text-xs font-bold text-accent-correo transition-colors hover:opacity-80"
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
    </div>
  );
}

export default EditorCorreo;
