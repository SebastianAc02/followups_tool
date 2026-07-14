'use client';
// Lienzo del embudo: leyenda de etapas + bandas apiladas + tarjetas de resultado.
import type { Embudo } from '../../core/embudo';
import { FUNNEL_ETAPAS } from '../../db/funnel';
import { FunnelBand } from './FunnelBand';
import { OutcomeCard } from './OutcomeCard';

export function FunnelCanvas({ embudo }: { embudo: Embudo }) {
  return (
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
            <FunnelBand key={b.estado} banda={b} indice={i} totalBandas={embudo.bandas.length} />
          ))}
        </div>
        <div className="flex gap-3.5 mt-2">
          <OutcomeCard resultado={embudo.ganado} tono="ganado" />
          <OutcomeCard resultado={embudo.onHold} tono="onhold" />
        </div>
        {embudo.sinEtapa > 0 && (
          <p className="mono text-[11px] text-faint mt-4">{embudo.sinEtapa} empresas sin etapa comercial (fuera del embudo)</p>
        )}
      </div>
    </div>
  );
}
