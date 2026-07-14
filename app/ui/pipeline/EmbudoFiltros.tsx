// Chips de filtro del tab Embudo: escriben owner/campana a la URL (?tab=embudo&owner=...&campana=...)
// Mismo patron que PipelineSidebar (searchParams como fuente de verdad, un solo query
// param por dimension). Los demas chips del mockup (SDR/Closer, trimestre, segmento)
// no tienen filtro real detras todavia -- se omiten en vez de fingir que funcionan.
'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { cn } from '../cn';

export interface EmbudoFiltrosProps {
  owners: string[];
  campanas: { id: number; nombre: string }[];
}

export function EmbudoFiltros({ owners, campanas }: EmbudoFiltrosProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const ownerActivo = searchParams.get('owner');
  const campanaActiva = searchParams.get('campana');

  function setParam(key: 'owner' | 'campana', value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  if (owners.length === 0 && campanas.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {owners.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted mr-1">Owner</span>
          {owners.map((owner) => (
            <button
              key={owner}
              onClick={() => setParam('owner', ownerActivo === owner ? null : owner)}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-150 border',
                ownerActivo === owner
                  ? 'bg-accent-bg text-accent-ink border-transparent'
                  : 'text-muted border-line-card hover:text-ink hover:bg-white/5',
              )}
            >
              {owner}
            </button>
          ))}
        </div>
      )}

      {campanas.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted mr-1">Campaña</span>
          {campanas.map((campana) => (
            <button
              key={campana.id}
              onClick={() => setParam('campana', campanaActiva === String(campana.id) ? null : String(campana.id))}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-150 border',
                campanaActiva === String(campana.id)
                  ? 'bg-accent-bg text-accent-ink border-transparent'
                  : 'text-muted border-line-card hover:text-ink hover:bg-white/5',
              )}
            >
              {campana.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
