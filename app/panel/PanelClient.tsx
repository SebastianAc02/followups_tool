'use client';

// Shell client del panel: Cockpit (lectura) es la vista por defecto; un boton de lapiz
// aparte entra al modo edicion (drag & drop del tablero), sin toggle tipo pastilla --
// feedback de Sebastian: el par de botones Cockpit/Editar se veia como una pestaña mas,
// no como una accion secundaria. El layout del tablero vive ACA (no en Constructor ni en
// Cockpit): si cada uno tuviera su propio estado, quitar un widget en Editar no se veria
// reflejado al volver a Cockpit hasta recargar la pagina -- bug real que reporto
// Sebastian 2026-07-13 ("le doy X y no se guarda", en realidad si se guardaba en la DB,
// el problema era que la UI no compartia el estado entre las dos vistas).
import { useState } from 'react';
import type { TableroItem } from '../core/panel/tablero';
import type { MetricaValor } from '../core/panel/metricas';
import { IconEditar, IconVolver } from '../ui/shell/icons';
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
  const [layout, setLayout] = useState<TableroItem[]>(tablero);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-heading text-2xl font-semibold text-foreground">Panel</div>
          <div className="text-xs text-muted-foreground">
            Ventana <span className="mono">{desde}</span> a <span className="mono">{hasta}</span> · {email}
          </div>
        </div>
        {modo === 'cockpit' ? (
          <button
            type="button"
            onClick={() => setModo('constructor')}
            title="Editar tablero"
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            <IconEditar className="h-4 w-4" />
            Editar tablero
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setModo('cockpit')}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            <IconVolver className="h-4 w-4" />
            Volver al cockpit
          </button>
        )}
      </div>

      {modo === 'cockpit' ? (
        <Cockpit tablero={layout} metricas={metricas} owner={owner} owners={owners} desde={desde} hasta={hasta} />
      ) : (
        <Constructor layout={layout} onLayoutChange={setLayout} metricas={metricas} />
      )}
    </div>
  );
}
