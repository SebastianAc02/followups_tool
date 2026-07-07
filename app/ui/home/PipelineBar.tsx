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
          <div className="flex h-11 gap-0.5 overflow-hidden rounded-lg">
            {segmentos.map((s) => (
              <div
                key={s.estado}
                className={`flex flex-col items-center justify-center transition-all duration-150 ${s.colorClass}`}
                style={{ width: `${(s.n / total) * 100}%` }}
              >
                <span className="font-heading text-sm leading-none text-white">{s.n}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-0.5">
            {segmentos.map((s) => (
              <div
                key={s.estado}
                className="overflow-hidden px-1 text-center"
                style={{ width: `${(s.n / total) * 100}%` }}
              >
                <span className="block truncate text-xs text-muted">{s.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
