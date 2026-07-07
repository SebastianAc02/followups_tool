'use client';

import { useState } from 'react';
import CrearCampana from './CrearCampana';
import { NuevoSegmento } from './NuevoSegmento';

type Segmento = { id: number; nombre: string; descripcionNatural: string | null };
type Opciones = Record<'estado' | 'categoria' | 'estado_comercial' | 'ciudad' | 'departamento' | 'owner' | 'rol', string[]>;

export function NuevaCampanaFlujo({ segmentosIniciales, opciones }: { segmentosIniciales: Segmento[]; opciones: Opciones }) {
  const [segmentos, setSegmentos] = useState(segmentosIniciales);
  const [mostrarBuilder, setMostrarBuilder] = useState(segmentosIniciales.length === 0);

  function onGuardado(s: Segmento) {
    setSegmentos((prev) => [s, ...prev]);
    setMostrarBuilder(false);
  }

  return (
    <div>
      {!mostrarBuilder && segmentos.length > 0 && (
        <>
          <CrearCampana segmentos={segmentos} />
          <button type="button" className="mt-4 text-[13px] text-muted underline" onClick={() => setMostrarBuilder(true)}>
            Armar un segmento nuevo
          </button>
        </>
      )}

      {mostrarBuilder && (
        <>
          <NuevoSegmento opciones={opciones} onGuardado={onGuardado} />
          {segmentos.length > 0 && (
            <button type="button" className="mt-4 text-[13px] text-muted underline" onClick={() => setMostrarBuilder(false)}>
              Usar un segmento guardado
            </button>
          )}
        </>
      )}
    </div>
  );
}
