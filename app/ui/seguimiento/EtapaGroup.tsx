// Grupo de etapa: cabecera colapsable + tarjetas de empresas
'use client';

import { useState } from 'react';
import { cn } from '../cn';
import { EmpresaRow, type EmpresaRowData } from './EmpresaRow';

// Palabra del numero de toque (1-indexed: no existe "toque cero", el primer
// contacto de la secuencia YA es un toque). Mas alla de 'diez' cae a digito.
const TOQUE_PALABRA = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'];
export function toquePalabra(n: number): string {
  return TOQUE_PALABRA[n] ?? String(n);
}

export interface EtapaGroupData {
  estado: string; // clave del grupo (ej. 'toque-3')
  label?: string; // subtitulo opcional -- el overview de pipeline agrupa por paso de
  // la secuencia y NO le pega una etapa del funnel al grupo (toque 3 no implica "Reunión")
  toque?: number; // Toque uno, Toque dos, etc. (numero de paso de la cadencia, 1-indexed)
  colorClass?: string; // clase Tailwind del fondo (de FUNNEL_ETAPAS)
  total: number; // total de empresas en esta etapa
  mezclaCanales?: {
    ll: number;
    wa: number;
    co: number;
  };
  toquesHoy?: number;
}

export function EtapaGroup({
  data,
  empresas,
  onSelectEmpresa,
  defaultExpanded = false,
}: {
  data: EtapaGroupData;
  empresas: EmpresaRowData[];
  onSelectEmpresa?: (empresaId: string) => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggleExpanded = () => setExpanded(!expanded);

  return (
    <div
      className={cn(
        'border rounded-2xl mb-2 overflow-hidden',
        expanded ? 'bg-black/15 border-line-strong' : 'bg-transparent border-line-card'
      )}
    >
      <button
        onClick={toggleExpanded}
        className="stage-head w-full flex items-center gap-4 px-4 py-3 hover:bg-white/3 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-expanded={expanded}
      >
        {/* Toque y etapa */}
        <div className="w-28 flex-shrink-0 flex flex-col gap-0.5 text-left">
          {data.toque !== undefined && (
            <span className="font-body text-lg font-semibold text-ink leading-none">
              Toque {toquePalabra(data.toque)}
            </span>
          )}
          {data.label && <span className="text-xs font-semibold text-blue-400">{data.label}</span>}
        </div>

        {/* Total */}
        <div className="w-12 flex-shrink-0 text-right">
          <span className="font-body text-xl font-bold text-ink tabular-nums">{data.total}</span>
        </div>

        {/* Mezcla de canales */}
        {data.mezclaCanales && (
          <>
            <div className="flex-1 min-w-0">
              <div className="flex h-4 rounded overflow-hidden bg-white/3 w-4/5">
                <div
                  className="bg-blue-400"
                  style={{
                    width: `${(data.mezclaCanales.ll / data.total) * 100}%`,
                  }}
                />
                <div
                  className="bg-emerald-400"
                  style={{
                    width: `${(data.mezclaCanales.wa / data.total) * 100}%`,
                  }}
                />
                <div
                  className="bg-violet-400"
                  style={{
                    width: `${(data.mezclaCanales.co / data.total) * 100}%`,
                  }}
                />
              </div>
            </div>
            <div className="w-44 flex-shrink-0 flex justify-around items-center">
              <span className="font-body text-sm font-semibold text-blue-400 tabular-nums">
                {data.mezclaCanales.ll}
              </span>
              <span className="font-body text-sm font-semibold text-emerald-400 tabular-nums">
                {data.mezclaCanales.wa}
              </span>
              <span className="font-body text-sm font-semibold text-violet-400 tabular-nums">
                {data.mezclaCanales.co}
              </span>
            </div>
          </>
        )}

        {/* Toques de hoy */}
        {data.toquesHoy !== undefined && (
          <div className="w-16 flex-shrink-0 flex justify-end">
            {data.toquesHoy > 0 ? (
              <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-400/14 text-amber-400 text-xs font-bold">
                <span
                  className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_0_3px_rgba(242,183,56,0.22)]"
                  aria-hidden="true"
                />
                {data.toquesHoy}
              </span>
            ) : (
              <span className="text-slate-600 text-xs tabular-nums font-body">—</span>
            )}
          </div>
        )}

        {/* Chevron */}
        <span className={cn('w-4 flex-shrink-0 text-muted text-xs text-center transition-transform duration-150', expanded && 'rotate-90')}>
          ▶
        </span>
      </button>

      {/* Tarjetas expandidas -- si no hay empresas para esta etapa, no se dibuja nada
          (evita el cajon vacio al desplegar un grupo sin datos) */}
      {expanded && empresas.length > 0 && (
        <div className="px-4 pb-4 pt-3 border-t border-line-card bg-black/15">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {empresas.map((empresa) => (
              <EmpresaRow key={empresa.id} data={empresa} onSelect={onSelectEmpresa} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
