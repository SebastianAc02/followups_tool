'use client';
// Lienzo del embudo: leyenda de etapas + bandas apiladas + tarjetas de resultado, mas
// el panel lateral que lista las cuentas de la etapa clickeada (EtapaEmpresasPanel).
// El panel lateral SOLO existe cuando hay una etapa elegida -- el embudo ocupa todo el
// ancho por defecto, no reserva espacio para un panel vacio (pedido de Sebastian).
import { useState } from 'react';
import type { Embudo } from '../../core/embudo';
import { CLAVE_SIN_ETAPA } from '../../core/embudo';
import { FUNNEL_ETAPAS } from '../../db/funnel';
import { cn } from '../cn';
import { FunnelBand } from './FunnelBand';
import { OutcomeCard } from './OutcomeCard';
import { EtapaEmpresasPanel, type EtapaSeleccionada } from './EtapaEmpresasPanel';

export function FunnelCanvas({ embudo, owner, campana }: { embudo: Embudo; owner?: string; campana?: string }) {
  const [etapaSeleccionada, setEtapaSeleccionada] = useState<EtapaSeleccionada | null>(null);

  return (
    <div className={cn('grid grid-cols-1 gap-4 items-start', etapaSeleccionada && 'lg:grid-cols-[1fr_360px]')}>
      <div className="rounded-2xl border border-line-card bg-pipeline-card overflow-hidden">
        <div className="flex flex-wrap gap-3 px-4 py-3 border-b border-line">
          {FUNNEL_ETAPAS.map((e) => (
            <span key={e.estado} className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
              <span className={`w-2.5 h-2.5 rounded-sm ${e.colorClass}`} />
              {e.label}
            </span>
          ))}
        </div>
        {/* max-w-xl (576px) dejaba la banda mas angosta en ~69px utiles y los numeros se
            cortaban. 4xl (896px) + el taper repartido de FunnelBand dan aire real. Se
            angosta a 2xl solo cuando el panel lateral de etapa esta abierto y comparte
            el ancho. */}
        <div className={cn('mx-auto px-6 py-8', etapaSeleccionada ? 'max-w-2xl' : 'max-w-4xl')}>
          <div className="flex flex-col">
            {embudo.bandas.map((b, i) => (
              <FunnelBand
                key={b.estado}
                banda={b}
                indice={i}
                totalBandas={embudo.bandas.length}
                onClick={() => setEtapaSeleccionada({ estado: b.estado, label: b.label })}
              />
            ))}
          </div>
          <div className="flex gap-3.5 mt-2">
            <OutcomeCard
              resultado={embudo.ganado}
              tono="ganado"
              onClick={() => setEtapaSeleccionada({ estado: embudo.ganado.estado, label: embudo.ganado.label })}
            />
            <OutcomeCard
              resultado={embudo.onHold}
              tono="onhold"
              onClick={() => setEtapaSeleccionada({ estado: embudo.onHold.estado, label: embudo.onHold.label })}
            />
          </div>
          {embudo.sinEtapa > 0 && (
            <button
              type="button"
              onClick={() => setEtapaSeleccionada({ estado: CLAVE_SIN_ETAPA, label: 'Sin etapa comercial' })}
              className="mono text-[11px] text-faint mt-4 hover:text-muted transition-colors"
            >
              {embudo.sinEtapa} empresas sin etapa comercial (fuera del embudo)
            </button>
          )}
        </div>
      </div>

      {etapaSeleccionada && (
        <EtapaEmpresasPanel
          etapa={etapaSeleccionada}
          owner={owner}
          campana={campana}
          onClose={() => setEtapaSeleccionada(null)}
        />
      )}
    </div>
  );
}
