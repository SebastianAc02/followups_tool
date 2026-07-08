'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { pausarCampanaAction, reanudarCampanaAction, cancelarCampanaAction } from './actions';
import { useConfirm } from '../../ui/useConfirm';

// Fase 7 (ciclo de vida): Pausar/Reanudar son reversibles y de un clic (sin Apollo
// detras). Cancelar SI tiene consecuencia externa real (archiva la secuencia en
// Apollo, sin vuelta atras -- ver actions.ts), por eso pide confirmacion explicita
// en vez de disparar directo como Pausar/Reanudar.
export function CicloVidaControles({ idCampana, estado }: { idCampana: number; estado: string }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState('');
  const { confirmar, elemento: dialogoConfirmar } = useConfirm();

  if (estado !== 'activa' && estado !== 'pausada') return null;

  function pausar() {
    setError('');
    startTransition(async () => {
      const res = await pausarCampanaAction(idCampana);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function reanudar() {
    setError('');
    startTransition(async () => {
      const res = await reanudarCampanaAction(idCampana);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  async function cancelar() {
    const ok = await confirmar({
      titulo: '¿Cancelar esta campaña?',
      mensaje: 'Esto archiva la secuencia en Apollo y no se puede deshacer.',
      textoConfirmar: 'Cancelar campaña',
    });
    if (!ok) return;
    setError('');
    startTransition(async () => {
      const res = await cancelarCampanaAction(idCampana);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        {estado === 'activa' && (
          <button
            type="button"
            onClick={pausar}
            disabled={pendiente}
            className="rounded-lg border border-line-strong px-3 py-[7px] text-xs font-semibold text-ink-soft transition-colors hover:border-today/40 hover:text-today disabled:opacity-40"
          >
            {pendiente ? '…' : 'Pausar'}
          </button>
        )}
        {estado === 'pausada' && (
          <button
            type="button"
            onClick={reanudar}
            disabled={pendiente}
            className="rounded-lg border border-line-strong px-3 py-[7px] text-xs font-semibold text-ink-soft transition-colors hover:border-done/40 hover:text-done disabled:opacity-40"
          >
            {pendiente ? '…' : 'Reanudar'}
          </button>
        )}
        <button
          type="button"
          onClick={cancelar}
          disabled={pendiente}
          className="rounded-lg border border-line-strong px-3 py-[7px] text-xs font-semibold text-faint transition-colors hover:border-overdue/40 hover:text-overdue disabled:opacity-40"
        >
          Cancelar
        </button>
      </div>
      {error && <p className="max-w-[220px] text-right text-xs text-overdue">{error}</p>}
      {dialogoConfirmar}
    </div>
  );
}
