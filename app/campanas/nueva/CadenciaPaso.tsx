'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { crearBorradorDesdeCadenciaAction, actualizarBorradorAction } from './actions';
import { ImportarCadencia, type CadenciaResuelta } from './ImportarCadencia';
import { Seg, SegButton } from '../../ui/Seg';
import type { ModoCampana } from '../../db/validation';
import type { Segmento } from './NuevaCampanaFlujo';

export function CadenciaPaso({ segmento, onVolver }: { segmento: Segmento; onVolver: () => void }) {
  const router = useRouter();
  const [cadencia, setCadencia] = useState<CadenciaResuelta | null>(null);
  const [idCampana, setIdCampana] = useState<number | null>(null);
  const [nombreCampana, setNombreCampana] = useState('');
  const [modo, setModo] = useState<ModoCampana>('prioritaria');
  const [guardandoBorrador, setGuardandoBorrador] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [navegando, setNavegando] = useState(false);
  const nombreGuardadoRef = useRef('');

  // Draft persistente: en cuanto la cadencia resuelve (formato + contenido validos),
  // se crea la campana en 'borrador' de una vez, sin esperar ningun clic mas. Si el
  // usuario cierra la pestaña aca, el draft ya quedo con id propio en /campanas.
  async function onCadenciaResuelta(r: CadenciaResuelta) {
    setCadencia(r);
    setError(null);
    setGuardandoBorrador(true);
    const nombreInicial = r.preview.nombre;
    const res = await crearBorradorDesdeCadenciaAction({
      idSegmento: segmento.id,
      formato: r.formato,
      contenido: r.contenido,
      nombreCsv: r.nombreCsv,
    });
    setGuardandoBorrador(false);
    if (res.ok) {
      setIdCampana(res.idCampana);
      setNombreCampana(nombreInicial);
      nombreGuardadoRef.current = nombreInicial;
    } else {
      setError(res.error);
    }
  }

  function onLimpiarCadencia() {
    setCadencia(null);
    setIdCampana(null);
    setNombreCampana('');
  }

  async function guardarNombreSiCambio() {
    if (!idCampana) return;
    const nombre = nombreCampana.trim();
    if (!nombre || nombre === nombreGuardadoRef.current) return;
    nombreGuardadoRef.current = nombre;
    const res = await actualizarBorradorAction(idCampana, { nombre });
    if (!res.ok) setError(res.error);
  }

  async function cambiarModo(nuevo: ModoCampana) {
    setModo(nuevo);
    if (!idCampana) return;
    const res = await actualizarBorradorAction(idCampana, { modo: nuevo });
    if (!res.ok) setError(res.error);
  }

  function continuarALanzar() {
    if (!idCampana) return;
    setNavegando(true);
    router.push(`/campanas/${idCampana}/lanzar`);
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
        <div className="flex items-center gap-3">
          {idCampana && (
            <span className="text-[12px] text-faint">
              {guardandoBorrador ? 'Guardando borrador…' : `Guardado como borrador #${idCampana}`}
            </span>
          )}
          <span className="text-[13px] text-muted">
            Segmento: <span className="font-medium text-ink-soft">{segmento.nombre}</span>
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-[720px] px-8 py-8">
        <ImportarCadencia onResuelto={onCadenciaResuelta} onLimpiar={onLimpiarCadencia} />

        {cadencia && (
          <div className="mt-8 flex flex-col gap-4 border-t border-line pt-6">
            <div className="flex items-center gap-3">
              <input
                value={nombreCampana}
                onChange={(e) => setNombreCampana(e.target.value)}
                onBlur={guardarNombreSiCambio}
                placeholder="Nombre de la campaña"
                className="flex-1 rounded-lg border border-line-strong bg-surface px-3 py-[10px] text-[13px] text-ink outline-none placeholder:text-faint focus:border-ink-soft"
              />
              <Seg>
                <SegButton on={modo === 'prioritaria'} onClick={() => cambiarModo('prioritaria')}>
                  Prioritaria
                </SegButton>
                <SegButton on={modo === 'batch'} onClick={() => cambiarModo('batch')}>
                  Batch
                </SegButton>
              </Seg>
            </div>
            <p className="text-[12.5px] text-muted">
              {modo === 'prioritaria'
                ? 'Revisás y personalizás lead por lead antes de mandar.'
                : 'El copy sale igual para todo el grupo del día; podés editarlo antes de confirmar.'}
            </p>

            {error && <p className="text-[13px] text-overdue">{error}</p>}

            <button
              type="button"
              onClick={continuarALanzar}
              disabled={!idCampana || !nombreCampana.trim() || navegando}
              className="self-start rounded-[9px] bg-accent px-5 py-[10px] text-[13px] font-semibold text-bg disabled:opacity-40"
            >
              {navegando ? 'Abriendo…' : 'Continuar a Lanzar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
