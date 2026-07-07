'use client';

import { useEffect, useState, useTransition } from 'react';
import type { DefinicionSegmento } from '../../db/validation';
import { previsualizarConReadinessAction, guardarSegmentoAction, type PreviewConReadiness } from '../actions';
import { FiltroWall } from './FiltroWall';
import { CopilotoPanel } from './CopilotoPanel';
import { TablaCuentas } from './TablaCuentas';

type Opciones = Record<'estado' | 'categoria' | 'estado_comercial' | 'ciudad' | 'departamento' | 'owner' | 'rol', string[]>;

const VACIO: DefinicionSegmento = { condiciones: [] };

type Props = {
  opciones: Opciones;
  onGuardado: (s: { id: number; nombre: string; descripcionNatural: string | null }) => void;
};

export function NuevoSegmento({ opciones, onGuardado }: Props) {
  const [def, setDef] = useState<DefinicionSegmento>(VACIO);
  // ids de la version ANTERIOR del segmento; se usan una sola vez para marcar
  // "relajada" las filas que el relleno del Copiloto sumo, luego se limpian.
  const [idsPrevios, setIdsPrevios] = useState<string[] | undefined>(undefined);
  const [preview, setPreview] = useState<PreviewConReadiness | null>(null);
  const [nombre, setNombre] = useState('');
  const [ultimaFrase, setUltimaFrase] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (def.condiciones.length === 0) {
      setPreview(null);
      return;
    }
    const idsParaMarcar = idsPrevios;
    startTransition(async () => {
      setPreview(await previsualizarConReadinessAction(def, idsParaMarcar));
    });
    setIdsPrevios(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def]);

  async function guardar() {
    setError('');
    const limpio = nombre.trim();
    if (!limpio) {
      setError('El segmento necesita un nombre');
      return;
    }
    setGuardando(true);
    const r = await guardarSegmentoAction(limpio, def);
    setGuardando(false);
    if (r.ok) {
      onGuardado({ id: r.idSegmento, nombre: limpio, descripcionNatural: ultimaFrase || null });
    } else {
      setError(r.error);
    }
  }

  return (
    <div className="overflow-hidden rounded-[18px] border border-line bg-bg shadow-[0_30px_70px_-28px_rgba(0,0,0,.6)]">
      <div className="flex items-center justify-between border-b border-line px-6 py-[15px]">
        <div className="flex items-center gap-3 text-[13px]">
          <span className="text-faint">Nueva campaña</span>
          <span className="text-line-strong">·</span>
          <span className="flex items-center gap-[7px]">
            <span className="grid h-[18px] w-[18px] place-items-center rounded-[5px] bg-accent font-mono text-[11px] font-semibold text-bg">
              1
            </span>
            <span className="font-semibold text-ink">Segmento</span>
          </span>
          <span className="text-line-strong">›</span>
          <span className="text-faint">Cadencia</span>
          <span className="text-line-strong">›</span>
          <span className="text-faint">Reglas</span>
          <span className="text-line-strong">›</span>
          <span className="text-faint">Preview</span>
        </div>
        <div className="flex items-center gap-3">
          {error && <span className="text-[13px] text-overdue">{error}</span>}
          {preview?.ok && def.condiciones.length > 0 && (
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre del segmento"
              className="w-[220px]"
            />
          )}
          <button
            type="button"
            onClick={guardar}
            disabled={!preview?.ok || def.condiciones.length === 0 || guardando}
            className="rounded-[9px] bg-accent px-4 py-[9px] text-[13px] font-semibold text-bg disabled:opacity-40"
          >
            {guardando ? 'Guardando…' : 'Guardar y continuar'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[220px_1fr_340px]">
        <FiltroWall value={def} onChange={setDef} opciones={opciones} />

        {preview?.ok ? (
          <TablaCuentas filas={preview.filas} conteos={preview.conteos} />
        ) : preview && !preview.ok ? (
          <div className="border-r border-line px-[22px] py-6">
            <p className="text-[13px] text-overdue">{preview.error}</p>
          </div>
        ) : (
          <div className="border-r border-line px-[22px] py-6">
            <p className="text-[13px] text-muted">Agrega un filtro o pídele al Copiloto que arme el segmento.</p>
          </div>
        )}

        <CopilotoPanel
          estadoActual={def}
          total={preview?.ok ? preview.conteos.total : undefined}
          onResultado={(r) => {
            if (r.relleno && preview?.ok) setIdsPrevios(preview.filas.map((f) => f.id));
            setUltimaFrase(r.frase);
            setDef(r.estado);
          }}
        />
      </div>
    </div>
  );
}
