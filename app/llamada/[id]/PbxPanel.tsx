"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { interpretarPBXAction, cerrarPBXAction, iniciarPBXAction } from "./actions";
import type { PbxInterpretado } from "../../core/pbx-interpretar";
import type { PbxContexto } from "../../db/repository";

// Bucle PBX (Fase 5): la ficha, cuando la empresa no tiene un KDM alcanzable (Fase 1).
// Reemplaza a LlamadaCard mientras la empresa esta en el bucle -- la cadencia comercial
// normal no aplica todavia, el objetivo es conseguir el dato del decisor (spec
// 2026-07-14-pbx-cadencia-enriquecimiento-design.md).

const FORMA_LABEL: Record<string, string> = {
  llamar_conmutador: "Llamar al conmutador",
  conseguir_numero: "Conseguir el número",
  enviar_correo: "Enviar correo",
  esperar: "Esperar",
  hablar_con: "Hablar con la persona referida",
  escalar: "Escalar",
  graduar: "Graduar",
};

const inputClase =
  "w-full rounded-lg border border-line bg-shell px-2.5 py-2 text-[13px] text-ink placeholder:text-faint outline-none focus:border-accent-llamada";

function canalDeForma(forma: string | null): "llamada" | "correo" {
  return forma === "enviar_correo" ? "correo" : "llamada";
}

export function PbxPanel({ idEmpresa, nombre, pbx }: { idEmpresa: string; nombre: string; pbx: PbxContexto }) {
  const router = useRouter();
  const [canal, setCanal] = useState<"llamada" | "correo">(canalDeForma(pbx.forma));
  const [quePaso, setQuePaso] = useState("");
  const [interpretando, setInterpretando] = useState(false);
  const [borrador, setBorrador] = useState<PbxInterpretado | null>(null);
  const [kdmNombre, setKdmNombre] = useState("");
  const [kdmTelefono, setKdmTelefono] = useState("");
  const [kdmEmail, setKdmEmail] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function iniciar() {
    setGuardando(true);
    setError(null);
    try {
      const r = await iniciarPBXAction(idEmpresa, pbx.tieneNumeroConmutador);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    } finally {
      setGuardando(false);
    }
  }

  async function interpretar() {
    setInterpretando(true);
    setError(null);
    try {
      const r = await interpretarPBXAction(quePaso);
      setBorrador(r);
      setKdmNombre(r.kdmNombre ?? "");
      setKdmTelefono(r.kdmTelefono ?? "");
      setKdmEmail(r.kdmEmail ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo interpretar el resultado");
    } finally {
      setInterpretando(false);
    }
  }

  async function cerrar() {
    if (!borrador) return;
    setGuardando(true);
    setError(null);
    try {
      const kdm =
        borrador.clase === "dato_conseguido"
          ? { nombre: kdmNombre.trim(), telefono: kdmTelefono.trim() || null, email: kdmEmail.trim() || null }
          : undefined;
      if (borrador.clase === "dato_conseguido" && !kdm?.nombre) {
        setError("El nombre del decisor es obligatorio para graduar");
        setGuardando(false);
        return;
      }
      const r = await cerrarPBXAction({
        idEmpresa,
        canal,
        quePaso,
        interpretado: borrador,
        tieneNumeroConmutador: pbx.tieneNumeroConmutador,
        intentos: pbx.intentos,
        kdm,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setQuePaso("");
      setBorrador(null);
      router.refresh();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-shell">
      <div className="flex items-center justify-between border-b border-line bg-shell-2 px-4 py-3">
        <div>
          <div className="font-toque-heading text-sm leading-tight text-ink">{nombre}</div>
          <div className="mt-0.5 font-toque-mono text-xs text-muted">Sin decisor alcanzable · bucle PBX</div>
        </div>
        <span className="rounded-[7px] border border-[#232327] bg-[#1c1c20] px-[11px] py-[3px] text-[11.5px] font-semibold text-[#a9a9ad]">
          PBX
        </span>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <div>
          <div className="rounded-xl border border-accent-llamada bg-accent-llamada-soft p-4">
            <div className="text-base font-semibold leading-tight text-ink">
              {pbx.forma ? FORMA_LABEL[pbx.forma] ?? pbx.forma : "Empezar el bucle"}
            </div>
            {pbx.tieneNumeroConmutador ? (
              <div className="mt-0.5 font-toque-mono text-xs font-medium text-accent-llamada">{pbx.numeroConmutador}</div>
            ) : (
              <div className="mt-0.5 text-xs text-muted">Todavía no hay número del conmutador</div>
            )}
          </div>
          <div className="mt-2 font-toque-mono text-[10.5px] text-muted">
            Intentos: {pbx.intentos.llamadas} llamadas · {pbx.intentos.correos} correos
          </div>
          {pbx.sugerenciaEscalar && (
            <div className="mt-2 rounded-lg border border-line bg-shell-2 px-3 py-2 text-[12px] text-ink-soft">
              El bucle lleva varios intentos sin dato nuevo. Considera escalar (referido / otra vía).
            </div>
          )}
        </div>

        {!pbx.forma ? (
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <p className="text-[12.5px] text-muted">
              Cuenta recien detectada en el bucle. Arranca con el primer paso (llamar al conmutador o
              conseguir el numero, segun lo que haya).
            </p>
            <button
              type="button"
              disabled={guardando}
              onClick={iniciar}
              className="self-start rounded-lg bg-accent-llamada px-4 py-2 text-[12.5px] font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Empezar el bucle
            </button>
            {error && <p className="text-[12px] text-overdue">{error}</p>}
          </div>
        ) : (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <div>
            <span className="font-toque-mono text-[9.5px] uppercase tracking-wide text-faint">Canal de este intento</span>
            <div className="mt-1 flex gap-1.5">
              {(["llamada", "correo"] as const).map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setCanal(c)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                    canal === c
                      ? "border-accent-llamada bg-accent-llamada-soft text-ink"
                      : "border-line bg-shell text-muted hover:border-line-strong"
                  }`}
                >
                  {c === "llamada" ? "Llamada" : "Correo"}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="font-toque-mono text-[9.5px] uppercase tracking-wide text-faint">Qué pasó</span>
            <textarea
              className={`${inputClase} resize-none`}
              rows={3}
              placeholder="Que te dijeron, si pidieron correo, si te refirieron a alguien..."
              value={quePaso}
              onChange={(e) => setQuePaso(e.target.value)}
              disabled={interpretando}
            />
          </label>

          {interpretando ? (
            <div className="flex items-center gap-2 rounded-lg border border-accent-llamada bg-accent-llamada-soft px-3 py-2">
              <span className="h-3 w-3 flex-none animate-spin rounded-full border-2 border-accent-llamada border-t-transparent" />
              <span className="font-toque-mono text-[11.5px] text-accent-llamada">Interpretando...</span>
            </div>
          ) : (
            <button
              type="button"
              className="self-start rounded-lg bg-accent-llamada px-3.5 py-1.5 text-[12.5px] font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-40"
              disabled={!quePaso.trim()}
              onClick={interpretar}
            >
              Interpretar con IA
            </button>
          )}

          {error && <p className="text-[12px] text-overdue">{error}</p>}

          {borrador && (
            <div className="flex flex-col gap-3 rounded-lg border border-line bg-shell-2 p-3">
              <label className="flex flex-col gap-1">
                <span className="font-toque-mono text-[9.5px] uppercase tracking-wide text-faint">Próximo paso propuesto</span>
                <input
                  className={inputClase}
                  value={borrador.proximoPasoTexto}
                  onChange={(e) => setBorrador({ ...borrador, proximoPasoTexto: e.target.value })}
                />
              </label>

              {borrador.clase === "dato_conseguido" && (
                <div className="grid grid-cols-3 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="font-toque-mono text-[9.5px] uppercase tracking-wide text-faint">Nombre KDM</span>
                    <input className={inputClase} value={kdmNombre} onChange={(e) => setKdmNombre(e.target.value)} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="font-toque-mono text-[9.5px] uppercase tracking-wide text-faint">Teléfono</span>
                    <input className={inputClase} value={kdmTelefono} onChange={(e) => setKdmTelefono(e.target.value)} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="font-toque-mono text-[9.5px] uppercase tracking-wide text-faint">Correo</span>
                    <input className={inputClase} value={kdmEmail} onChange={(e) => setKdmEmail(e.target.value)} />
                  </label>
                </div>
              )}

              <button
                type="button"
                disabled={guardando}
                onClick={cerrar}
                className="self-start rounded-lg bg-accent-llamada px-4 py-2 text-[12.5px] font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {borrador.clase === "dato_conseguido" ? "Graduar de PBX" : "Guardar y aprobar"}
              </button>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

export default PbxPanel;
