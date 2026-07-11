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
  archivada: 'cold',
} as const;

const ESTADO_LABEL: Record<string, string> = {
  activa: 'Activa',
  pausada: 'Pausada',
  borrador: 'Borrador',
  archivada: 'Archivada',
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
// Fix 5 (2026-07-08): patron "editar" estilo iPhone -- normalmente no se ve nada;
// el afordante de remover (badge de menos, esquina superior izquierda) solo aparece
// cuando el grid entra en modo edición, en vez de una ✕ fija siempre visible.
export function CampanaCard({ campana, editando }: { campana: CampanaCardVM; editando: boolean }) {
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
      {esBorrador && editando && (
        <button
          type="button"
          onClick={eliminar}
          disabled={pendiente}
          title="Eliminar borrador"
          className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-overdue bg-overdue text-[13px] font-bold leading-none text-white shadow-[0_1px_4px_rgba(0,0,0,0.35)] transition-transform duration-150 hover:scale-110 disabled:opacity-40"
        >
          {pendiente ? '…' : '−'}
        </button>
      )}
      {error && <p className="mt-1.5 text-xs text-overdue">{error}</p>}
      {dialogoConfirmar}
    </div>
  );
}
