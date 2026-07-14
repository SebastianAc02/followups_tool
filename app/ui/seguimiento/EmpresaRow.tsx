// Fila de empresa en el pipeline: nombre, contacto, paso, canal, estado "hoy"
'use client';

import { cn } from '../cn';
import { CanalTag, type Canal } from '../CanalTag';

export interface EmpresaRowData {
  id: string;
  nombre: string;
  contacto: string;
  cargo: string;
  pasoActual: string;
  diaSecuencia: number;
  cadencia: string;
  objetivo: string | null;
  canal: Canal;
  esHoy?: boolean;
}

export function EmpresaRow({
  data,
  onSelect,
}: {
  data: EmpresaRowData;
  onSelect?: (id: string) => void;
}) {
  return (
    <article
      data-empresa-id={data.id}
      onClick={() => onSelect?.(data.id)}
      className={cn(
        'border rounded-xl p-3 flex flex-col gap-1.5',
        'transition-all duration-150 cursor-pointer',
        'hover:-translate-y-0.5 hover:shadow-md',
        data.esHoy
          ? 'bg-pipeline-card-today border-amber-400/30 hover:border-amber-400/55'
          : 'bg-pipeline-card border-line-card hover:border-line-card'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink truncate">{data.nombre}</span>
        <CanalTag canal={data.canal} className="flex-shrink-0" />
      </div>
      <div className="text-xs text-ink-soft truncate">{data.contacto}</div>
      <div className="text-xs text-muted truncate">{data.cargo}</div>
      <div className="text-xs font-medium text-accent-ink truncate">{data.cadencia}</div>
      {data.objetivo && <div className="text-xs text-muted truncate italic">{data.objetivo}</div>}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span className="w-1.5 h-1.5 rounded-sm bg-blue-400" aria-hidden="true" />
          {data.pasoActual}
        </span>
        {data.esHoy && (
          <span className="flex items-center gap-1 text-xs font-bold tracking-wide text-amber-400">
            <span
              className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_0_3px_rgba(242,183,56,0.22)]"
              aria-hidden="true"
            />
            HOY
          </span>
        )}
      </div>
    </article>
  );
}
