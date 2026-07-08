'use client';

import { useState } from 'react';
import { NuevoSegmento } from './NuevoSegmento';
import { CadenciaPaso } from './CadenciaPaso';

export type Segmento = { id: number; nombre: string; descripcionNatural: string | null };
export type Opciones = Record<'estado' | 'categoria' | 'estado_comercial' | 'ciudad' | 'departamento' | 'owner' | 'rol', string[]>;

export function NuevaCampanaFlujo({ segmentosIniciales, opciones }: { segmentosIniciales: Segmento[]; opciones: Opciones }) {
  const [segmentos, setSegmentos] = useState(segmentosIniciales);
  const [segmentoElegido, setSegmentoElegido] = useState<Segmento | null>(null);
  // Sobrevive a "volver a Segmento" (a diferencia de segmentoElegido, que SI se
  // limpia): es lo que le dice a NuevoSegmento cual definicion recargar en vez de
  // arrancar de VACIO cuando el usuario vuelve sobre sus pasos.
  const [ultimoSegmento, setUltimoSegmento] = useState<Segmento | null>(null);

  if (!segmentoElegido) {
    return (
      <NuevoSegmento
        opciones={opciones}
        segmentosGuardados={segmentos}
        reanudarDesde={ultimoSegmento}
        onGuardado={(s) => {
          setSegmentos((prev) => (prev.some((p) => p.id === s.id) ? prev : [s, ...prev]));
          setUltimoSegmento(s);
          setSegmentoElegido(s);
        }}
      />
    );
  }

  return <CadenciaPaso segmento={segmentoElegido} onVolver={() => setSegmentoElegido(null)} />;
}
