'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import type { DefinicionSegmento } from '../../../db/validation';
import { previsualizarConReadinessAction, actualizarSegmentoAction, type PreviewConReadiness } from '../../actions';
import { FiltroWall } from '../../nueva/FiltroWall';
import { CopilotoPanel } from '../../nueva/CopilotoPanel';
import { TablaCuentas } from '../../nueva/TablaCuentas';
import type { Opciones } from '../../nueva/NuevaCampanaFlujo';

type SegmentoInicial = { id: number; nombre: string; definicion: DefinicionSegmento; descripcionNatural: string | null };

// Version recortada de NuevoSegmento para editar el segmento de una campana YA
// creada: sin autosave (el segmento ya existe con id real, no hay nada que crear de
// una), sin dropdown de "segmentos guardados" (cambiar el segmento entero de esta
// campana por otro es una operacion distinta, fuera de alcance aca), con un
// "Guardar cambios" explicito en vez de "Guardar y continuar" (no hay a donde
// continuar, esto no es parte del wizard de creacion).
export function SegmentoCockpit({ idCadencia, segmento, opciones }: { idCadencia: number; segmento: SegmentoInicial; opciones: Opciones }) {
  const [def, setDef] = useState<DefinicionSegmento>(segmento.definicion);
  const [nombre, setNombre] = useState(segmento.nombre);
  const [idsPrevios, setIdsPrevios] = useState<string[] | undefined>(undefined);
  const [preview, setPreview] = useState<PreviewConReadiness | null>(null);
  const [ultimaFrase, setUltimaFrase] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
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
    const res = await actualizarSegmentoAction(segmento.id, { nombre: limpio, definicion: def });
    setGuardando(false);
    if (res.ok) {
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2000);
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border border-line bg-bg shadow-[0_30px_70px_-28px_rgba(0,0,0,.6)]">
      <div className="flex shrink-0 items-center justify-between border-b border-line px-6 py-[15px]">
        <div>
          <p className="font-mono-tag text-xs uppercase tracking-widest text-muted">Campaña · Segmento</p>
          <p className="text-[13px] text-ink-soft">Ajustá a quién le llega esta campaña.</p>
        </div>
        <div className="flex items-center gap-3">
          {error && <span className="text-[13px] text-overdue">{error}</span>}
          {guardado && <span className="text-[12px] text-done">Guardado ✓</span>}
          <Link
            href={`/cadencias/${idCadencia}`}
            className="rounded-lg border border-line-strong px-3 py-[9px] text-[13px] text-ink-soft hover:text-ink"
          >
            Volver a Cadencia
          </Link>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || def.condiciones.length === 0}
            className="rounded-[9px] bg-accent px-4 py-[9px] text-[13px] font-semibold text-bg disabled:opacity-40"
          >
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[220px_1fr_340px]">
        <FiltroWall
          value={def}
          onChange={setDef}
          opciones={opciones}
          nombreSegmento={nombre}
          onNombreSegmentoChange={setNombre}
          mostrarNombre
        />

        {preview?.ok ? (
          <TablaCuentas filas={preview.filas} conteos={preview.conteos} idSegmento={segmento.id} />
        ) : preview && !preview.ok ? (
          <div className="min-h-0 min-w-0 border-r border-line px-[22px] py-6">
            <p className="text-[13px] text-overdue">{preview.error}</p>
          </div>
        ) : (
          <div className="min-h-0 min-w-0 border-r border-line px-[22px] py-6">
            <p className="text-[13px] text-muted">Agrega un filtro o pídele al Copiloto que ajuste el segmento.</p>
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
