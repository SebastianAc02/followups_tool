'use client';

import { useTransition } from 'react';
import { avanzarDiaDemo, reiniciarRelojDemo } from './reloj-demo-actions';

// Solo se monta en modo prueba (TopBar decide). Muestra la fecha simulada y dos acciones:
// avanzar un dia (materializa + empuja inline) y reiniciar a hoy real. La fecha llega ya
// calculada desde el server (offset aplicado) para no meter una isla de reloj.
export function RelojDemo({ fechaSimulada, offset }: { fechaSimulada: string; offset: number }) {
  const [pendiente, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2 rounded-md bg-surface-2 px-2.5 py-1 text-[12px] text-muted ring-1 ring-line-card">
      <span className="tabular-nums">Dia simulado: {fechaSimulada}{offset > 0 ? ` (+${offset})` : ''}</span>
      <button
        type="button"
        disabled={pendiente}
        onClick={() => startTransition(() => avanzarDiaDemo())}
        className="rounded border border-line-card px-2 py-0.5 font-semibold hover:text-strong disabled:opacity-50"
      >
        Siguiente dia
      </button>
      {offset > 0 && (
        <button
          type="button"
          disabled={pendiente}
          onClick={() => startTransition(() => reiniciarRelojDemo())}
          className="underline underline-offset-2 hover:no-underline disabled:opacity-50"
        >
          Reiniciar
        </button>
      )}
    </div>
  );
}
