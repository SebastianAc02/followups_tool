'use client';

import { cn } from '../../ui/cn';
import { CanalTag } from '../../ui/CanalTag';
import { ReadinessBadge } from './ReadinessBadge';
import type { PreviewConReadiness } from '../actions';

type Filas = Extract<PreviewConReadiness, { ok: true }>['filas'];
type Conteos = Extract<PreviewConReadiness, { ok: true }>['conteos'];

const COLS = 'grid grid-cols-[22px_1.6fr_1fr_0.8fr_1.1fr_1.6fr] items-center gap-[10px]';

export function TablaCuentas({ filas, conteos }: { filas: Filas; conteos: Conteos }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col border-r border-line">
      <div className="flex shrink-0 items-center gap-4 border-b border-line px-[22px] py-[15px]">
        <span className="serif text-[22px] text-ink">{conteos.total}</span>
        <span className="-ml-3 text-[13px] text-muted">cuentas</span>
        <span className="text-[13px] text-done">{conteos.listas} listas</span>
        {conteos.sinCanal > 0 && <span className="text-[13px] text-overdue">{conteos.sinCanal} sin canal</span>}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-[640px]">
          <div className={cn(COLS, 'sticky top-0 z-10 bg-bg px-[22px] py-[9px] font-mono text-[10px] uppercase tracking-[0.06em] text-faint')}>
            <span />
            <span>Cuenta</span>
            <span>Ciudad</span>
            <span className="text-right">Usuarios</span>
            <span>Estado</span>
            <span>Canales disponibles</span>
          </div>

          {filas.length === 0 ? (
            <p className="px-[22px] py-4 text-[13px] text-muted">Ninguna cuenta cumple los filtros todavía.</p>
          ) : (
            filas.map((f) => (
              <div key={f.id} className={cn(COLS, 'border-t border-line px-[22px] py-[10px] text-[13px]')}>
                <input
                  type="checkbox"
                  checked
                  disabled
                  style={{ accentColor: 'var(--color-accent)' }}
                  title="guarda el segmento primero para incluir o excluir cuentas"
                />
                <span className="flex items-center gap-2 font-medium text-ink">
                  {f.nombre}
                  {f.relajada && (
                    <span className="rounded-full bg-accent-soft/20 px-[7px] py-[1px] text-[10px] font-medium text-accent">
                      relajada
                    </span>
                  )}
                </span>
                <span className="text-ink-soft">{f.ciudad ?? '—'}</span>
                <span className="text-right font-mono text-ink-soft">{f.usuarios != null ? f.usuarios.toLocaleString('es-CO') : '—'}</span>
                <span className="truncate text-ink-soft">{f.estado ?? 'sin estado'}</span>
                <div className="flex items-center gap-2">
                  {f.canales.length === 0 ? (
                    <span className="text-overdue">sin contacto</span>
                  ) : (
                    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      {f.canales.map((c) => (
                        <CanalTag key={c} canal={c} />
                      ))}
                    </span>
                  )}
                  <ReadinessBadge estado={f.readiness.estado} pasosSinCanal={f.readiness.pasosSinCanal} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
