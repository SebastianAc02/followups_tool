'use client';

// Puente chico de estado entre RegistrarToqueToggle y CapturaLlamada: revela el
// formulario de "Registrar toque" sin que LlamadaCard (server) necesite volverse
// cliente. Los campos de calificacion (usuarios/crm/pasarela) ya no pasan por aca --
// CalificacionChecklist los edita en linea y guarda directo (ver actions.ts).
import { createContext, useContext, useState, type ReactNode } from 'react';

type PreguntarValue = {
  abierto: boolean;
  abrir: () => void;
};

const PreguntarContext = createContext<PreguntarValue | null>(null);

export function PreguntarProvider({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);

  function abrir() {
    setAbierto(true);
  }

  return <PreguntarContext.Provider value={{ abierto, abrir }}>{children}</PreguntarContext.Provider>;
}

export function usePreguntar() {
  const ctx = useContext(PreguntarContext);
  if (!ctx) throw new Error('usePreguntar debe usarse dentro de PreguntarProvider');
  return ctx;
}
