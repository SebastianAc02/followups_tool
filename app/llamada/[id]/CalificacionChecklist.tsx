"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Calificacion, CampoCalificacion } from "../../core/calificacion";
import { actualizarCampoCalificacionAction } from "./actions";

// Checklist de calificacion del Toque 1: que ya tengo de la cuenta (dato cacheado) vs que
// me toca preguntar en la llamada. La logica de que cuenta como "tengo" vive en
// app/core/calificacion.ts (dominio puro) -- este componente solo pinta el resultado.
//
// Items PREGUNTAR editables inline (2026-07-08): usuarios/crm/pasarela SI tienen donde
// guardarse (columnas reales, ver actualizarCampoCalificacion en el repository), asi que
// un click abre un cajon de texto ahi mismo -- sin pasar por el formulario de Registrar
// toque, porque este dato no depende de haber calificado un resultado de llamada.
// "Cómo hacen el recaudo" se queda sin click a proposito -- no tiene columna en empresa
// todavia (decision de esquema aparte, ver docs/superpowers/specs): prometer un click
// que no guarda nada seria peor que dejarlo como esta.
const CAMPOS_CON_INPUT = new Set<CampoCalificacion>(["usuarios", "crm", "pasarela"]);

export function CalificacionChecklist({ idEmpresa, calificacion }: { idEmpresa: string; calificacion: Calificacion }) {
  const router = useRouter();
  const [editando, setEditando] = useState<CampoCalificacion | null>(null);
  const [valor, setValor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, startTransition] = useTransition();

  function abrir(campo: CampoCalificacion) {
    setEditando(campo);
    setValor("");
    setError(null);
  }

  function cancelar() {
    setEditando(null);
    setError(null);
  }

  function guardar(campo: CampoCalificacion) {
    if (!valor.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await actualizarCampoCalificacionAction(idEmpresa, campo, valor.trim());
      if (res.ok) {
        setEditando(null);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-xs font-semibold text-ink-soft">Calificación</span>
        <span className="font-toque-mono text-[10px] font-semibold text-muted">
          {calificacion.tengo} / {calificacion.total}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {calificacion.items.map((item) =>
          item.estado === "tengo" ? (
            <div key={item.campo} className="flex items-center gap-2 border-b border-line py-2">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-check/15" aria-hidden="true">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4} className="text-check">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
              <span className="flex-1 text-[12.5px] text-muted">{item.label}</span>
              <span className="font-toque-mono text-[13px] font-semibold text-ink">{item.valor}</span>
            </div>
          ) : CAMPOS_CON_INPUT.has(item.campo) && editando === item.campo ? (
            <div key={item.campo} className="flex flex-col gap-1.5 rounded-lg border border-dashed border-pending bg-pending-soft px-3 py-2">
              <span className="text-[12.5px] font-semibold text-pending">{item.label}</span>
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  type={item.campo === "usuarios" ? "number" : "text"}
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") guardar(item.campo);
                    if (e.key === "Escape") cancelar();
                  }}
                  placeholder="—"
                  disabled={guardando}
                  className="w-full rounded-md border border-line bg-shell px-2 py-1 text-[12.5px] text-ink outline-none focus:border-accent-llamada"
                />
                <button
                  type="button"
                  onClick={() => guardar(item.campo)}
                  disabled={guardando || !valor.trim()}
                  className="shrink-0 rounded-md bg-accent-llamada px-2.5 py-1 text-[11.5px] font-semibold text-ink disabled:opacity-40"
                >
                  {guardando ? "…" : "Guardar"}
                </button>
                <button
                  type="button"
                  onClick={cancelar}
                  disabled={guardando}
                  className="shrink-0 text-[11.5px] text-muted hover:text-ink"
                >
                  Cancelar
                </button>
              </div>
              {error && <p className="text-[11px] text-overdue">{error}</p>}
            </div>
          ) : CAMPOS_CON_INPUT.has(item.campo) ? (
            <button
              type="button"
              key={item.campo}
              onClick={() => abrir(item.campo)}
              title="Editar este dato de la cuenta"
              className="flex w-full items-center gap-2 rounded-lg border border-dashed border-pending bg-pending-soft px-3 py-2 text-left transition-colors hover:border-solid hover:bg-pending-soft/70"
            >
              <span className="h-4 w-4 shrink-0 rounded-full border border-pending" aria-hidden="true" />
              <span className="flex-1 text-[12.5px] font-semibold text-pending">{item.label}</span>
              <span className="font-toque-mono text-[9px] font-semibold text-pending">PREGUNTAR</span>
            </button>
          ) : (
            <div
              key={item.campo}
              className="flex items-center gap-2 rounded-lg border border-dashed border-pending bg-pending-soft px-3 py-2"
            >
              <span className="h-4 w-4 shrink-0 rounded-full border border-pending" aria-hidden="true" />
              <span className="flex-1 text-[12.5px] font-semibold text-pending">{item.label}</span>
              <span className="font-toque-mono text-[9px] font-semibold text-pending">PREGUNTAR</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
