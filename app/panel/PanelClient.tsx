'use client';

// Shell client del panel: toggle Cockpit (lectura) / Constructor (drag & drop). Puro
// estado local -- no persiste el "modo", solo cual vista se ve ahora mismo (equivalente
// al nav Ejecutivo/Constructor del mockup, index.html:83-131).
import { useState } from 'react';
import type { TableroItem } from '../core/panel/tablero';
import type { MetricaValor } from '../core/panel/metricas';
import { Cockpit } from './Cockpit';
import { Constructor } from './Constructor';

type Props = {
  tablero: TableroItem[];
  metricas: Record<string, MetricaValor>;
  email: string;
  desde: string;
  hasta: string;
  owner?: string;
  owners: string[];
};

export function PanelClient({ tablero, metricas, email, desde, hasta, owner, owners }: Props) {
  const [modo, setModo] = useState<'cockpit' | 'constructor'>('cockpit');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-heading text-2xl font-semibold text-foreground">Panel</div>
          <div className="text-xs text-muted-foreground">
            Ventana <span className="mono">{desde}</span> a <span className="mono">{hasta}</span> · {email}
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-border bg-muted p-1">
          <button
            type="button"
            onClick={() => setModo('cockpit')}
            className={`rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
              modo === 'cockpit' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Cockpit
          </button>
          <button
            type="button"
            onClick={() => setModo('constructor')}
            className={`rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
              modo === 'constructor' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Constructor
          </button>
        </div>
      </div>

      {modo === 'cockpit' ? (
        <Cockpit tablero={tablero} metricas={metricas} owner={owner} owners={owners} desde={desde} hasta={hasta} />
      ) : (
        <Constructor tableroInicial={tablero} metricas={metricas} />
      )}
    </div>
  );
}
