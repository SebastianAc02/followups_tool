'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Tabs, type TabItem } from '../ui/Tabs';
import { CampanaCard, type CampanaCardVM } from './CampanaCard';
import { SegmentoSueltoCard, type SegmentoSueltoVM } from './SegmentoSueltoCard';

type FiltroEstado = 'todas' | 'activa' | 'pausada' | 'borrador' | 'archivada';

export function CampanasGrid({ campanas, segmentosSueltos }: { campanas: CampanaCardVM[]; segmentosSueltos: SegmentoSueltoVM[] }) {
  const [filtro, setFiltro] = useState<FiltroEstado>('todas');
  // Modo edición estilo iPhone (Fix 5, 2026-07-08): normalmente no se ve nada; al
  // entrar en modo edición aparece el afordante de remover en las tarjetas borrador.
  const [editando, setEditando] = useState(false);
  const hayBorradores = campanas.some((c) => c.estado === 'borrador');

  const conteos = {
    todas: campanas.length + segmentosSueltos.length,
    activa: campanas.filter((c) => c.estado === 'activa').length,
    pausada: campanas.filter((c) => c.estado === 'pausada').length,
    // Un segmento sin campana todavia (autosave del wizard, se fue antes de pegar
    // cadencia) es igual de "borrador" que una campana en estado 'borrador' -- solo
    // que un paso mas atras, ver segmentosSinCampana en el repository.
    borrador: campanas.filter((c) => c.estado === 'borrador').length + segmentosSueltos.length,
    archivada: campanas.filter((c) => c.estado === 'archivada').length,
  };

  const items: TabItem[] = [
    { key: 'todas', label: 'Todas', count: conteos.todas },
    { key: 'activa', label: 'Activas', count: conteos.activa, tone: 'done' },
    { key: 'pausada', label: 'Pausada', count: conteos.pausada, tone: 'today' },
    { key: 'borrador', label: 'Borrador', count: conteos.borrador, tone: 'faint' },
    { key: 'archivada', label: 'Archivadas', count: conteos.archivada, tone: 'faint' },
  ];

  const visibles = filtro === 'todas' ? campanas : campanas.filter((c) => c.estado === filtro);
  const segmentosVisibles = filtro === 'todas' || filtro === 'borrador' ? segmentosSueltos : [];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <Tabs value={filtro} onChange={(key) => setFiltro(key as FiltroEstado)} items={items} />
        {hayBorradores && (
          <button
            type="button"
            onClick={() => setEditando((v) => !v)}
            className="text-xs font-semibold text-muted transition-colors hover:text-ink"
          >
            {editando ? 'Listo' : 'Editar'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
        {visibles.map((c) => (
          <CampanaCard key={c.id} campana={c} editando={editando} />
        ))}
        {segmentosVisibles.map((s) => (
          <SegmentoSueltoCard key={`seg-${s.id}`} segmento={s} />
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
