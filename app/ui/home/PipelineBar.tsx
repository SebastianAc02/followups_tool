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
    <div className="mb-9">
      <div className="mb-3.5 flex items-center justify-between">
        <SectionLabel className="mb-0">Pipeline por etapa</SectionLabel>
        <Link href="/panel" className="text-[12.5px] font-semibold text-accent-soft">
          Ver módulo →
        </Link>
      </div>

      {total === 0 ? (
        <div className="text-[13px] text-muted">Nada en el funnel todavía.</div>
      ) : (
        <>
          <div className="flex h-[46px] gap-[3px] overflow-hidden rounded-[12px]">
            {segmentos.map((s) => (
              <div
                key={s.estado}
                className={`flex flex-col items-center justify-center ${s.colorClass}`}
                style={{ width: `${(s.n / total) * 100}%` }}
              >
                <span className="text-[14px] font-extrabold text-white">{s.n}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-[3px]">
            {segmentos.map((s) => (
              <div
                key={s.estado}
                className="overflow-hidden text-ellipsis whitespace-nowrap px-0.5 text-center"
                style={{ width: `${(s.n / total) * 100}%` }}
              >
                <span className="text-[11px] text-muted">{s.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
