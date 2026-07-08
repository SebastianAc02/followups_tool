'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sincronizarCopyApolloAction } from './actions';

// Sesion 2026-07-08: subir/editar el copy de la cadencia en Apollo, separado del ciclo
// de vida (CicloVidaControles) porque no cambia campana.estado -- solo empuja
// steps/templates a la secuencia externa. Reintentable: apretar el boton dos veces no
// duplica nada (sincronizarCopyApolloAction es create-si-falta/update-si-existe).
export function SincronizarCopiaControl({ idCampana, proveedorCampanaId }: { idCampana: number; proveedorCampanaId: string | null }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  if (!proveedorCampanaId) return null;

  function sincronizar() {
    setMensaje(null);
    startTransition(async () => {
      const res = await sincronizarCopyApolloAction(idCampana);
      if (res.ok) {
        setMensaje({ tipo: 'ok', texto: `${res.pasos} ${res.pasos === 1 ? 'paso subido' : 'pasos subidos'} a Apollo.` });
        router.refresh();
      } else {
        setMensaje({ tipo: 'error', texto: res.error });
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={sincronizar}
        disabled={pendiente}
        className="rounded-lg border border-line-strong px-3 py-[7px] text-xs font-semibold text-ink-soft transition-colors hover:border-today/40 hover:text-today disabled:opacity-40"
      >
        {pendiente ? 'Subiendo…' : 'Subir copy a Apollo'}
      </button>
      {mensaje && (
        <p className={`max-w-[220px] text-right text-xs ${mensaje.tipo === 'error' ? 'text-overdue' : 'text-done'}`}>{mensaje.texto}</p>
      )}
    </div>
  );
}
