'use client';

import { useState } from 'react';
import type { DefinicionSegmento } from '../../db/validation';
import { copilotoAction } from '../actions';

type Mensaje = {
  frase: string;
  explicacion?: string;
  noMapeado?: string[];
  error?: string;
  relleno?: { eje: string; motivo: string };
};

type Props = {
  estadoActual: DefinicionSegmento;
  total?: number;
  onResultado: (r: { estado: DefinicionSegmento; relleno?: { eje: string; motivo: string }; frase: string }) => void;
};

export function CopilotoPanel({ estadoActual, total, onResultado }: Props) {
  const [frase, setFrase] = useState('');
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [pendiente, setPendiente] = useState(false);

  async function traducir() {
    const dicho = frase.trim();
    if (!dicho || pendiente) return;
    setPendiente(true);
    const r = await copilotoAction(dicho, estadoActual, total);
    if (r.ok) {
      setMensajes((prev) => [
        ...prev,
        { frase: dicho, explicacion: r.explicacion, noMapeado: r.noMapeado, relleno: r.relleno },
      ]);
      onResultado({ estado: r.estado, relleno: r.relleno, frase: dicho });
      setFrase('');
    } else {
      setMensajes((prev) => [...prev, { frase: dicho, error: r.error }]);
    }
    setPendiente(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0c0d10]">
      <div className="flex shrink-0 items-center gap-[9px] border-b border-line px-[18px] py-[15px]">
        <span className="grid h-[22px] w-[22px] place-items-center rounded-[7px] bg-gradient-to-br from-accent to-[#6e5cff] text-[13px] text-bg">
          ✦
        </span>
        <span className="text-[14px] font-semibold text-ink">Copiloto</span>
        <span className="rounded-[5px] border border-accent/40 px-[6px] py-[1px] font-mono text-[10px] text-accent">BETA</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto p-[18px]">
        {mensajes.length === 0 && (
          <p className="text-[13px] leading-[1.5] text-ink-soft">
            Dime a quién quieres llegar y armo el segmento. Puedes ajustar cualquier filtro a mano.
          </p>
        )}
        {mensajes.map((m, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="max-w-[88%] self-end rounded-[12px_12px_3px_12px] border border-accent/30 bg-accent/[.16] px-[13px] py-[10px] text-[13px] leading-[1.45] text-ink">
              {m.frase}
            </div>
            {m.error ? (
              <div className="max-w-[92%] text-[13px] leading-[1.5] text-overdue">{m.error}</div>
            ) : (
              <>
                {m.explicacion && <div className="max-w-[92%] text-[13px] leading-[1.5] text-ink-soft">{m.explicacion}</div>}
                {m.relleno && (
                  <div className="max-w-[92%] rounded-[13px] border border-line bg-surface p-[14px]">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-today" aria-hidden="true" />
                      <span className="text-[12px] font-semibold text-ink">Relajé un filtro para llegar a la meta</span>
                    </div>
                    <p className="text-[12px] leading-[1.5] text-muted">
                      El eje <span className="text-ink-soft">{m.relleno.eje}</span> dominaba el segmento: {m.relleno.motivo}
                    </p>
                  </div>
                )}
                {m.noMapeado && m.noMapeado.length > 0 && (
                  <div className="max-w-[92%] rounded-[13px] border border-line bg-surface p-[14px]">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-overdue" aria-hidden="true" />
                      <span className="text-[12px] font-semibold text-ink">Parte de lo que dijiste no lo mapeé</span>
                    </div>
                    <p className="text-[12px] leading-[1.5] text-muted">
                      No entendí: {m.noMapeado.join(', ')}. Ajusta esa parte a mano en los filtros de la izquierda.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t border-line p-[14px_18px]">
        <div className="flex items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-3 py-[10px]">
          <span className="text-[14px] text-accent">✦</span>
          <input
            value={frase}
            onChange={(e) => setFrase(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && traducir()}
            placeholder="Afina el segmento..."
            className="flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
          />
          <button
            type="button"
            onClick={traducir}
            disabled={!frase.trim() || pendiente}
            className="rounded-full bg-accent px-3 py-1 text-[12px] font-semibold text-bg disabled:opacity-50"
          >
            {pendiente ? '…' : 'Traducir'}
          </button>
        </div>
      </div>
    </div>
  );
}
