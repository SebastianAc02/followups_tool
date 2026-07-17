'use client';

import { useState, useTransition } from 'react';
import { sacarDeCadenciaAction } from './actions';

// Baja de la cadencia desde la llamada (spec 2026-07-17). Gemelo de campanas/BotonSacar,
// con UNA diferencia deliberada: confirma en dos pasos.
//
// El porque: en Destinatarios sacas a alguien mirando una tabla, con calma. Aca lo haces
// colgando el telefono, con la cabeza en la llamada, y un clic errado saca a una cuenta de
// una cadencia viva SIN aviso ni forma de devolverla (volver a meter todavia espera la
// regla de Sebastian, ver core/reinscripcion.ts). El segundo clic cuesta medio segundo y
// tapa el unico camino a un error silencioso e irreversible.
export function BotonSacarDeCadencia({
  idEmpresa,
  idInscripcion,
}: {
  idEmpresa: string;
  idInscripcion: number;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function sacar() {
    setError(null);
    startTransition(async () => {
      const res = await sacarDeCadenciaAction(idEmpresa, idInscripcion);
      if (!res.ok) {
        setError(res.error);
        setConfirmando(false);
        return;
      }
      // Sin resetear confirmando en el caso OK: revalidatePath re-renderiza el riel y esta
      // inscripcion ya no viene, asi que el boton se desmonta solo.
    });
  }

  if (error) {
    return (
      <div className="px-4 pb-3">
        <p className="text-[11px] leading-snug text-overdue">{error}</p>
        <button
          type="button"
          onClick={() => setError(null)}
          className="mt-1 text-[11px] text-muted underline underline-offset-2 hover:no-underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!confirmando) {
    return (
      <div className="px-4 pb-3">
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="text-[11px] text-muted underline underline-offset-2 hover:text-overdue hover:no-underline"
        >
          Sacar de la cadencia
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 pb-3">
      <p className="text-[11px] leading-snug text-ink-soft">
        No le vuelve a salir ningún paso. Por ahora no tiene vuelta atrás.
      </p>
      <div className="mt-1.5 flex items-center gap-3">
        <button
          type="button"
          disabled={pendiente}
          onClick={sacar}
          className="text-[11px] font-semibold text-overdue underline underline-offset-2 hover:no-underline disabled:opacity-50"
        >
          {pendiente ? 'Sacando...' : 'Sí, sacar'}
        </button>
        <button
          type="button"
          disabled={pendiente}
          onClick={() => setConfirmando(false)}
          className="text-[11px] text-muted underline underline-offset-2 hover:no-underline disabled:opacity-50"
        >
          No
        </button>
      </div>
    </div>
  );
}
