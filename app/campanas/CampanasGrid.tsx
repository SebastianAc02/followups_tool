'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Tabs, type TabItem } from '../ui/Tabs';
import { CampanaCard, type CampanaCardVM } from './CampanaCard';

type FiltroEstado = 'todas' | 'activa' | 'pausada' | 'borrador';

export function CampanasGrid({ campanas }: { campanas: CampanaCardVM[] }) {
  const [filtro, setFiltro] = useState<FiltroEstado>('todas');

  const conteos = {
    todas: campanas.length,
    activa: campanas.filter((c) => c.estado === 'activa').length,
    pausada: campanas.filter((c) => c.estado === 'pausada').length,
    borrador: campanas.filter((c) => c.estado === 'borrador').length,
  };

  const items: TabItem[] = [
    { key: 'todas', label: 'Todas', count: conteos.todas },
    { key: 'activa', label: 'Activas', count: conteos.activa, tone: 'done' },
    { key: 'pausada', label: 'Pausada', count: conteos.pausada, tone: 'today' },
    { key: 'borrador', label: 'Borrador', count: conteos.borrador, tone: 'faint' },
  ];

  const visibles = filtro === 'todas' ? campanas : campanas.filter((c) => c.estado === filtro);

  return (
    <div>
      <Tabs value={filtro} onChange={(key) => setFiltro(key as FiltroEstado)} items={items} className="mb-6" />

      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
        {visibles.map((c) => (
          <CampanaCard key={c.id} campana={c} />
        ))}

        <Link
          href="/campanas/nueva"
          className="flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong text-sm font-semibold text-muted transition-colors duration-150 hover:border-accent-soft hover:text-accent-soft"
        >
          + Nueva campaña
        </Link>
      </div>
    </div>
  );
}
