// Banda individual del embudo: trapecio (clip-path) con el label, total y usuarios
// de una etapa, mas el chip de conversion respecto a la banda anterior.
import type { BandaEmbudo } from '../../core/embudo';
import { cn } from '../cn';

export function FunnelBand({
  banda,
  indice,
  totalBandas,
  onClick,
}: {
  banda: BandaEmbudo;
  indice: number;
  totalBandas: number;
  onClick?: () => void;
}) {
  const inset = 8 + indice * 6;
  const insetNext = 8 + (indice + 1) * 6;
  const clip = `polygon(${inset}% 0, ${100 - inset}% 0, ${100 - insetNext}% 100%, ${insetNext}% 100%)`;
  return (
    <div className="flex flex-col">
      {banda.conversionDesdeAnterior !== null && (
        <div className="flex justify-center -my-1.5 relative z-10">
          <span className="mono text-[11px] px-2.5 py-0.5 rounded-full bg-shell border border-line text-check">
            {banda.conversionDesdeAnterior}% ↓
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={onClick}
        className={cn('funnel-band flex items-center justify-center text-center', banda.colorClass)}
        style={{ clipPath: clip, height: `${Math.max(72, 100 - indice * 4)}px` }}
      >
        <div>
          <div className="text-[13px] font-semibold uppercase tracking-wide text-ink">{banda.label}</div>
          <div className="mono text-[28px] leading-none text-ink my-1">{banda.total}</div>
          {banda.usuarios !== null && (
            <div className="mono text-[11px] text-ink/70">{banda.usuarios.toLocaleString('es-CO')} usuarios</div>
          )}
        </div>
      </button>
    </div>
  );
}
