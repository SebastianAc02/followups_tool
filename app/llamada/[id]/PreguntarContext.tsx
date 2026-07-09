'use client';

// Puente chico de estado entre CalificacionChecklist (items "PREGUNTAR") y
// RegistrarToqueToggle/CapturaLlamada (2026-07-08): antes eran dos piezas sin
// conexion -- el checklist solo informaba, y el formulario de abajo pedía todo de
// nuevo sin importar qué ya se sabía. Un click en un item PREGUNTAR ahora abre el
// formulario y enfoca ESE campo. LlamadaCard (server) sigue pintando ambas piezas en
// su posición normal; el contexto viaja a través de él sin que LlamadaCard necesite
// volverse cliente.
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { CampoCalificacion } from '../../core/calificacion';

type PreguntarValue = {
  abierto: boolean;
  campoEnfocado: CampoCalificacion | null;
  abrir: (campo?: CampoCalificacion) => void;
};

const PreguntarContext = createContext<PreguntarValue | null>(null);

export function PreguntarProvider({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const [campoEnfocado, setCampoEnfocado] = useState<CampoCalificacion | null>(null);

  function abrir(campo?: CampoCalificacion) {
    setCampoEnfocado(campo ?? null);
    setAbierto(true);
  }

  return <PreguntarContext.Provider value={{ abierto, campoEnfocado, abrir }}>{children}</PreguntarContext.Provider>;
}

export function usePreguntar() {
  const ctx = useContext(PreguntarContext);
  if (!ctx) throw new Error('usePreguntar debe usarse dentro de PreguntarProvider');
  return ctx;
}
