'use client';

import { useState } from 'react';
import { NuevoSegmento } from './NuevoSegmento';
import { CadenciaPaso } from './CadenciaPaso';

export type Segmento = { id: number; nombre: string; descripcionNatural: string | null };
export type Opciones = Record<'estado' | 'categoria' | 'estado_comercial' | 'ciudad' | 'departamento' | 'owner' | 'rol', string[]>;

export function NuevaCampanaFlujo({ segmentosIniciales, opciones }: { segmentosIniciales: Segmento[]; opciones: Opciones }) {
  const [segmentos, setSegmentos] = useState(segmentosIniciales);
  const [segmentoElegido, setSegmentoElegido] = useState<Segmento | null>(null);

  if (!segmentoElegido) {
    return (
      <NuevoSegmento
        opciones={opciones}
        segmentosGuardados={segmentos}
        onGuardado={(s) => {
          setSegmentos((prev) => [s, ...prev]);
          setSegmentoElegido(s);
        }}
        onElegirGuardado={setSegmentoElegido}
      />
    );
  }

  return <CadenciaPaso segmento={segmentoElegido} onVolver={() => setSegmentoElegido(null)} />;
}
