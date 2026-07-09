// Barra segmentada del pipeline por etapa. Recibe el conteo por estado (de contarPorEstado)
// y arma solo las etapas de FUNNEL_ETAPAS (excluye sin estado y on_hold). El ancho de cada
// segmento es % del total mostrado, calculado en runtime -> único style inline permitido.
import Link from 'next/link';
import { FUNNEL_ETAPAS } from '../../db/funnel';
import { SectionLabel } from '../SectionLabel';

export function PipelineBar({ porEstado }: { porEstado: Record<string, number> }) {
  const segmentos = FUNNEL_ETAPAS.map((e) => ({ ...e, n: porEstado[e.estado] ?? 0 })).filter((s) => s.n > 0);
  const total = segmentos.reduce((s, x) => s + x.n, 0);

  return (
    <div className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <SectionLabel className="mb-0">Pipeline por etapa</SectionLabel>
        <Link href="/panel" className="text-xs font-semibold text-accent-soft transition-colors hover:text-accent">
          Ver módulo →
        </Link>
      </div>

      {total === 0 ? (
        <div className="text-sm text-muted">Nada en el funnel todavía.</div>
      ) : (
        <>
          {/* Opción B (decidido 2026-07-08): la barra queda como puras proporciones, sin
              texto adentro -- las etapas con conteo chico (Reunión, Oportunidad, Contrato)
              no tienen espacio para un número ni un label legibles. Números + etapas van
              en la fila de chips de abajo, que nunca se corta. */}
          <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
            {segmentos.map((s) => (
              <div
                key={s.estado}
                className={`h-full transition-all duration-150 ${s.colorClass}`}
                style={{ width: `${(s.n / total) * 100}%` }}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {segmentos.map((s) => (
              <div
                key={s.estado}
                className="flex items-center gap-1.5 rounded-full border border-line-card bg-card px-2.5 py-1"
              >
                <span className={`h-2 w-2 flex-none rounded-full ${s.colorClass}`} />
                <span className="text-xs text-ink-soft">{s.label}</span>
                <span className="font-body text-xs font-bold tabular-nums text-ink">{s.n}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
