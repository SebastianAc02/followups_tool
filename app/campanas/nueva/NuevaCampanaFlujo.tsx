'use client';

import { useState } from 'react';
import { NuevoSegmento } from './NuevoSegmento';
import { CadenciaPaso } from './CadenciaPaso';

export type Segmento = { id: number; nombre: string; descripcionNatural: string | null };
export type Opciones = Record<'estado' | 'categoria' | 'estado_comercial' | 'ciudad' | 'departamento' | 'owner' | 'rol', string[]>;

export function NuevaCampanaFlujo({
  segmentosIniciales,
  opciones,
  segmentoInicial,
}: {
  segmentosIniciales: Segmento[];
  opciones: Opciones;
  segmentoInicial?: Segmento | null;
}) {
  const [segmentos, setSegmentos] = useState(segmentosIniciales);
  const [segmentoElegido, setSegmentoElegido] = useState<Segmento | null>(null);
  // Sobrevive a "volver a Segmento" (a diferencia de segmentoElegido, que SI se
  // limpia): es lo que le dice a NuevoSegmento cual definicion recargar en vez de
  // arrancar de VACIO cuando el usuario vuelve sobre sus pasos. segmentoInicial (la
  // tarjeta "Sin cadencia" del hub, ?segmento=<id>) reusa el mismo mecanismo: llega
  // precargado en vez de null, y NuevoSegmento lo retoma exactamente igual.
  const [ultimoSegmento, setUltimoSegmento] = useState<Segmento | null>(segmentoInicial ?? null);

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
