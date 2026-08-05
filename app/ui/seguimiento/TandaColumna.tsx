// Columna de Seguimiento, una por tanda (rediseño de tandas, paso 6): reemplaza los grupos
// "Toque uno, Toque dos, Aún no entran, Sin cadencia" -- ese agrupamiento solo tenía sentido con
// una cadencia única para todos, y la prueba de que no aplicaba era "Sin cadencia: 15", quince
// cuentas que la vista vieja no sabía dónde poner. Cada cuenta cae en EXACTAMENTE una tanda
// (clasificarTanda es excluyente por diseño), así que esta columna siempre tiene dónde ponerla.
//
// El orden de las filas NO se toca acá: ya viene de más viejo a más nuevo desde tandasTool.
// Reordenar en el cliente sería la misma clase de bug que tener dos lugares calculando lo mismo.
'use client';

import { useState } from 'react';
import { cn } from '../cn';
import { TANDA_LABEL, TANDA_TONO, TANDA_TONO_CLASE, textoDiasEnEstado } from '../tanda.variants';
import { EvidenciaTanda } from '../EvidenciaTanda';
import type { GrupoTanda } from '../../seguimiento/tandas-datos';

export function TandaColumna({ grupo, defaultExpanded = false }: { grupo: GrupoTanda; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  if (grupo.total === 0) return null;

  const tono = TANDA_TONO[grupo.tanda];

  return (
    <div className={cn('mb-2 overflow-hidden rounded-2xl border', expanded ? 'border-line-strong bg-black/15' : 'border-line-card bg-transparent')}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-all duration-150 hover:bg-white/3"
        aria-expanded={expanded}
      >
        <span className={cn('rounded-[7px] border px-2.5 py-1 text-[12px] font-semibold', TANDA_TONO_CLASE[tono])}>
          {TANDA_LABEL[grupo.tanda]}
        </span>
        <span className="font-body text-lg font-bold tabular-nums text-ink">{grupo.total}</span>
        <span className={cn('ml-auto w-4 flex-shrink-0 text-center text-xs text-muted transition-transform duration-150', expanded && 'rotate-90')}>
          ▶
        </span>
      </button>

      {expanded && (
        <div className="border-t border-line-card bg-black/15 px-2 pb-2 pt-2">
          <ul className="divide-y divide-line">
            {grupo.cuentas.map((c) => (
              <li key={c.idEmpresa}>
                <article
                  data-empresa-id={c.idEmpresa}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-white/5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-medium text-ink">{c.cuenta}</div>
                    <div className="mt-0.5 text-[11.5px] text-faint">{textoDiasEnEstado(c.diasEnEstado)}</div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <EvidenciaTanda regla={c.regla} evidencia={c.evidencia} advertencias={c.advertencias} />
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
