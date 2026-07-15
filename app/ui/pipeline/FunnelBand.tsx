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
  // El estrechamiento se REPARTE entre las bandas que haya, en vez de restar un 6% fijo
  // por banda. Con el paso fijo, la 6a banda quedaba en inset 38% (12% de ancho util) y
  // el clip-path le cortaba los numeros: el embudo se estrangulaba solo, y empeoraba
  // cada vez que se agregaba una etapa. Repartir INSET_FINAL entre totalBandas garantiza
  // que la banda mas angosta nunca baje de ~48% del ancho, con 6 etapas o con 12.
  const INSET_INICIAL = 6;
  const INSET_FINAL = 26;
  const paso = (INSET_FINAL - INSET_INICIAL) / Math.max(1, totalBandas);
  const inset = INSET_INICIAL + indice * paso;
  const insetNext = INSET_INICIAL + (indice + 1) * paso;
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
        // Alto: 4 lineas de texto (label + total 30px + usuarios + ISP/ESP) no caben en
        // 72px, se salian del trapecio y el clip-path las cortaba. El piso ahora sale de
        // lo que el contenido necesita, no de un numero puesto a ojo.
        style={{ clipPath: clip, height: `${Math.max(104, 124 - indice * 3)}px` }}
      >
        <div className="px-4">
          <div className="text-[13.5px] font-semibold uppercase tracking-wide text-ink">{banda.label}</div>
          <div className="mono text-[30px] leading-none text-ink my-1">{banda.total}</div>
          {banda.usuarios !== null && (
            <div className="mono text-[12px] text-ink/85">{banda.usuarios.toLocaleString('es-CO')} usuarios</div>
          )}
          {banda.porCategoria && (banda.porCategoria.isp.total > 0 || banda.porCategoria.esp.total > 0) && (
            <div className="mono text-[11px] text-ink/75 mt-0.5 whitespace-nowrap">
              ISP {banda.porCategoria.isp.total}
              {banda.porCategoria.isp.usuarios !== null ? ` (${banda.porCategoria.isp.usuarios.toLocaleString('es-CO')}u)` : ''}
              {' · '}
              ESP {banda.porCategoria.esp.total}
              {banda.porCategoria.esp.usuarios !== null ? ` (${banda.porCategoria.esp.usuarios.toLocaleString('es-CO')}u)` : ''}
            </div>
          )}
        </div>
      </button>
    </div>
  );
}
