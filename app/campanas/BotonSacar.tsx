'use client';

import { useTransition } from 'react';
import { sacarContactoDeCampanaAction } from './[id]/destinatarios/actions';

export function BotonSacar({ idInscripcion, idCampana }: { idInscripcion: number; idCampana: number }) {
  const [pendiente, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() => startTransition(() => sacarContactoDeCampanaAction(idInscripcion, idCampana))}
      className="text-[12px] text-overdue underline underline-offset-2 hover:no-underline disabled:opacity-50"
    >
      Sacar
    </button>
  );
}
