'use client';
// Lienzo del embudo: leyenda de etapas + bandas apiladas + tarjetas de resultado, mas
// el panel lateral que lista las cuentas de la etapa clickeada (EtapaEmpresasPanel).
import { useState } from 'react';
import type { Embudo } from '../../core/embudo';
import { CLAVE_SIN_ETAPA } from '../../core/embudo';
import { FUNNEL_ETAPAS } from '../../db/funnel';
import { FunnelBand } from './FunnelBand';
import { OutcomeCard } from './OutcomeCard';
import { EtapaEmpresasPanel, type EtapaSeleccionada } from './EtapaEmpresasPanel';

export function FunnelCanvas({ embudo, owner, campana }: { embudo: Embudo; owner?: string; campana?: string }) {
  const [etapaSeleccionada, setEtapaSeleccionada] = useState<EtapaSeleccionada | null>(null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 items-start">
      <div className="rounded-2xl border border-line-card bg-pipeline-card overflow-hidden">
        <div className="flex flex-wrap gap-3 px-4 py-3 border-b border-line">
          {FUNNEL_ETAPAS.map((e) => (
            <span key={e.estado} className="flex items-center gap-1.5 text-[12px] text-muted">
              <span className={`w-2.5 h-2.5 rounded-sm ${e.colorClass}`} />
              {e.label}
            </span>
          ))}
        </div>
        <div className="max-w-xl mx-auto px-6 py-8">
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

      <EtapaEmpresasPanel etapa={etapaSeleccionada} owner={owner} campana={campana} />
    </div>
  );
}
