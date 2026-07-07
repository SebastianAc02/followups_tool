'use client';

import { useState } from 'react';
import Link from 'next/link';
import { crearCampanaConCadenciaAction, type CrearCampanaResultado } from './actions';
import { ImportarCadencia, type CadenciaResuelta } from './ImportarCadencia';
import { Seg, SegButton } from '../../ui/Seg';
import type { ModoCampana } from '../../db/validation';
import type { Segmento } from './NuevaCampanaFlujo';

export function CadenciaPaso({ segmento, onVolver }: { segmento: Segmento; onVolver: () => void }) {
  const [cadencia, setCadencia] = useState<CadenciaResuelta | null>(null);
  const [nombreCampana, setNombreCampana] = useState('');
  const [modo, setModo] = useState<ModoCampana>('prioritaria');
  const [creando, setCreando] = useState(false);
  const [resultado, setResultado] = useState<CrearCampanaResultado | null>(null);

  async function confirmar() {
    if (!cadencia) return;
    setCreando(true);
    setResultado(
      await crearCampanaConCadenciaAction({
        nombreCampana,
        idSegmento: segmento.id,
        formato: cadencia.formato,
        contenido: cadencia.contenido,
        nombreCsv: cadencia.nombreCsv,
        modo,
      }),
    );
    setCreando(false);
  }

  if (resultado?.ok) {
    return (
      <div className="overflow-hidden rounded-[18px] border border-line bg-bg px-8 py-10 text-center shadow-[0_30px_70px_-28px_rgba(0,0,0,.6)]">
        <p className="font-serif text-2xl text-ink">Campaña #{resultado.idCampana} creada</p>
        <p className="mt-3 text-[13px] text-ink-soft">
          {resultado.resultado.inscritas} inscritas · {resultado.resultado.bloqueadas} bloqueadas (esperan contacto) ·{' '}
          {resultado.resultado.reemplazos} reemplazaron campaña anterior · {resultado.resultado.saltadas} ya estaban.
        </p>
        <Link
          href="/campanas"
          className="mt-6 inline-block rounded-[9px] bg-accent px-4 py-[9px] text-[13px] font-semibold text-bg"
        >
          Ver campañas
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[18px] border border-line bg-bg shadow-[0_30px_70px_-28px_rgba(0,0,0,.6)]">
      <div className="flex items-center justify-between border-b border-line px-6 py-[15px]">
        <div className="flex items-center gap-3 text-[13px]">
          <span className="text-faint">Nueva campaña</span>
          <span className="text-line-strong">·</span>
          <button type="button" onClick={onVolver} className="text-ink-soft hover:text-ink">
            Segmento
          </button>
          <span className="text-line-strong">›</span>
          <span className="flex items-center gap-[7px]">
            <span className="grid h-[18px] w-[18px] place-items-center rounded-[5px] bg-accent font-mono text-[11px] font-semibold text-bg">
              2
            </span>
            <span className="font-semibold text-ink">Cadencia</span>
          </span>
          <span className="text-line-strong">›</span>
          <span className="text-faint">Reglas</span>
          <span className="text-line-strong">›</span>
          <span className="text-faint">Preview</span>
        </div>
        <span className="text-[13px] text-muted">
          Segmento: <span className="font-medium text-ink-soft">{segmento.nombre}</span>
        </span>
      </div>

      <div className="mx-auto max-w-[720px] px-8 py-8">
        <ImportarCadencia onResuelto={setCadencia} onLimpiar={() => setCadencia(null)} />

        {cadencia && (
          <div className="mt-8 flex flex-col gap-4 border-t border-line pt-6">
            <div className="flex items-center gap-3">
              <input
                value={nombreCampana}
                onChange={(e) => setNombreCampana(e.target.value)}
                placeholder="Nombre de la campaña"
                className="flex-1 rounded-lg border border-line-strong bg-surface px-3 py-[10px] text-[13px] text-ink outline-none placeholder:text-faint focus:border-ink-soft"
              />
              <Seg>
                <SegButton on={modo === 'prioritaria'} onClick={() => setModo('prioritaria')}>
                  Prioritaria
                </SegButton>
                <SegButton on={modo === 'batch'} onClick={() => setModo('batch')}>
                  Batch
                </SegButton>
              </Seg>
            </div>
            <p className="text-[12.5px] text-muted">
              {modo === 'prioritaria'
                ? 'Revisás y personalizás lead por lead antes de mandar.'
                : 'El copy sale igual para todo el grupo del día; podés editarlo antes de confirmar.'}
            </p>

            {resultado && !resultado.ok && <p className="text-[13px] text-overdue">{resultado.error}</p>}

            <button
              type="button"
              onClick={confirmar}
              disabled={!nombreCampana.trim() || creando}
              className="self-start rounded-[9px] bg-accent px-5 py-[10px] text-[13px] font-semibold text-bg disabled:opacity-40"
            >
              {creando ? 'Creando…' : 'Crear e inscribir'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
