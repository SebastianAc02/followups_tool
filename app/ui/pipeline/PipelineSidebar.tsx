// Sidebar de campañas y filtros operativos del pipeline
'use client';

import { useSearchParams } from 'next/navigation';
import { cn } from '../cn';

export interface CampaignData {
  id: string;
  nombre: string;
  total: number;
  color: string; // hex color para el dot
}

export type OperativeFilter = 'en-secuencia' | 'toques-hoy' | 'on-hold' | 'cerradas';

const OPERATIVE_FILTERS: { id: OperativeFilter; label: string }[] = [
  { id: 'en-secuencia', label: 'En secuencia' },
  { id: 'toques-hoy', label: 'Toques de hoy' },
  { id: 'on-hold', label: 'On Hold' },
  { id: 'cerradas', label: 'Cerradas / Opt Out' },
];

export function PipelineSidebar({
  campaigns,
  onFilterChange,
}: {
  campaigns: CampaignData[];
  onFilterChange?: (filter: string | null) => void;
}) {
  const searchParams = useSearchParams();
  const activeFilter = searchParams.get('filter');

  return (
    <aside className="w-60 border-r border-line-card bg-shell flex flex-col overflow-hidden">
      {/* Filtros operativos */}
      <div className="px-3 pt-4 pb-3 shrink-0">
        <div className="px-2 pb-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted">Filtros operativos</span>
        </div>
        <div className="flex flex-col gap-0.5">
          {OPERATIVE_FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => onFilterChange?.(activeFilter === f.id ? null : f.id)}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all duration-150',
                activeFilter === f.id ? 'bg-accent-bg text-accent-ink' : 'text-muted hover:text-ink hover:bg-white/5'
              )}
            >
              <span className="w-2 h-2 rounded-sm bg-current flex-shrink-0" aria-hidden="true" />
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Campañas activas */}
      <div className="flex-1 min-h-0 flex flex-col mt-2 px-3 overflow-hidden">
        <div className="px-2 pb-2 shrink-0">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted">Campañas activas</span>
        </div>

        <div className="flex flex-col gap-0.5 overflow-y-auto">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-150 hover:bg-white/5 group"
            >
              <span
                className="shrink-0 w-2 h-2 rounded-sm"
                style={{ background: campaign.color }}
                aria-hidden="true"
              />
              <span className="flex-1 text-xs font-medium truncate text-ink-soft">{campaign.nombre}</span>
              <span className="font-mono text-xs tabular-nums shrink-0 text-muted">{campaign.total}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
