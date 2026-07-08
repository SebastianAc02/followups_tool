'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Pill } from '../ui/Pill';
import { CanalTag, type Canal } from '../ui/CanalTag';
import { Stat } from '../ui/Stat';
import { useConfirm } from '../ui/useConfirm';
import { eliminarCampanaBorradorAction } from './actions';

const ESTADO_TONE = {
  activa: 'hot',
  pausada: 'warm',
  borrador: 'cold',
} as const;

const ESTADO_LABEL: Record<string, string> = {
  activa: 'Activa',
  pausada: 'Pausada',
  borrador: 'Borrador',
};

export type CampanaCardVM = {
  id: number;
  nombre: string;
  estado: string;
  segmento: string;
  descripcionSegmento: string | null;
  pasos: number;
  dias: number | null;
  canalPrincipal: string | null;
  inscritas: number;
  bloqueadas: number;
};

// El boton de eliminar es un hermano del <Link>, no un hijo: un <button> dentro de
// un <a> es HTML invalido (contenido interactivo anidado) y ademas el click se
// propagaria a la navegacion. Solo se muestra en 'borrador' -- eliminarCampanaBorrador
// en el repository ya rechaza cualquier otro estado, esto es solo la UI para llegar ahi.
export function CampanaCard({ campana }: { campana: CampanaCardVM }) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState('');
  const { confirmar, elemento: dialogoConfirmar } = useConfirm();
  const tone = ESTADO_TONE[campana.estado as keyof typeof ESTADO_TONE] ?? 'cold';
  const label = ESTADO_LABEL[campana.estado] ?? campana.estado;
  const esBorrador = campana.estado === 'borrador';
  const meta = [
    `${campana.pasos} toques`,
    campana.dias != null ? `${campana.dias} días` : null,
    campana.descripcionSegmento ?? campana.segmento,
  ]
    .filter(Boolean)
    .join(' · ');

  async function eliminar() {
    const ok = await confirmar({ titulo: `¿Eliminar el borrador "${campana.nombre}"?`, mensaje: 'No se puede deshacer.' });
    if (!ok) return;
    setError('');
    startTransition(async () => {
      const res = await eliminarCampanaBorradorAction(campana.id);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="relative">
      <Link
        href={`/campanas/${campana.id}`}
        className="block rounded-2xl border border-line bg-card p-[18px] transition-all duration-150 hover:-translate-y-0.5 hover:bg-card-hover hover:shadow-lg"
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="max-w-[80%] truncate font-serif text-base tracking-tight text-ink">{campana.nombre}</span>
          <Pill tone={tone} dot>
            {label}
          </Pill>
        </div>
        <p className="mb-4 text-xs text-muted">{meta}</p>
        <div className="flex items-center justify-between">
          {campana.canalPrincipal && <CanalTag canal={campana.canalPrincipal as Canal} />}
          <div className="flex gap-4">
            <Stat value={campana.inscritas} label="inscritas" />
            <Stat value={campana.bloqueadas} label="bloq." tone={campana.bloqueadas > 0 ? 'overdue' : 'neutral'} />
          </div>
        </div>
      </Link>
      {esBorrador && (
        <button
          type="button"
          onClick={eliminar}
          disabled={pendiente}
          title="Eliminar borrador"
          className="absolute right-3 top-3 rounded-md border border-line-strong bg-card px-[7px] py-[3px] text-xs text-faint transition-colors hover:border-overdue/40 hover:text-overdue disabled:opacity-40"
        >
          {pendiente ? '…' : '✕'}
        </button>
      )}
      {error && <p className="mt-1.5 text-xs text-overdue">{error}</p>}
      {dialogoConfirmar}
    </div>
  );
}
