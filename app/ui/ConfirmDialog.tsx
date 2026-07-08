'use client';

import { useEffect, useRef } from 'react';
import { cn } from './cn';

export type ConfirmDialogProps = {
  titulo: string;
  mensaje?: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  // destructivo=true (default): boton solido en el color de "overdue" -- eliminar,
  // cancelar campana, cualquier accion sin vuelta atras. false: mismo bg-accent que
  // el resto de los CTAs primarios, para confirmaciones que no son destructivas.
  destructivo?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
};

// Reemplaza window.confirm() en toda la app: el dialogo nativo del navegador
// ("localhost:3000 says...") no se puede estilizar ni quitar, y trae su propio
// checkbox de "Don't show this again" que no controlamos. Este componente vive
// dentro de la pagina, con el mismo lenguaje visual (bg-card, border-line-strong,
// font-serif) que cualquier otro panel del cockpit. Se monta a traves de useConfirm(),
// no se usa solo -- ver ese hook para el patron await-a-una-promesa que reemplaza
// el "if (!confirm(...)) return" de una linea.
export function ConfirmDialog({
  titulo,
  mensaje,
  textoConfirmar = 'Eliminar',
  textoCancelar = 'Cancelar',
  destructivo = true,
  onConfirmar,
  onCancelar,
}: ConfirmDialogProps) {
  const confirmarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmarRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancelar();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancelar]);

  return (
    <div
      role="presentation"
      onClick={onCancelar}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-titulo"
        aria-describedby={mensaje ? 'confirm-dialog-mensaje' : undefined}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[400px] rounded-[18px] border border-line-strong bg-card p-6 shadow-[0_30px_70px_-28px_rgba(0,0,0,.6)]"
      >
        <h2 id="confirm-dialog-titulo" className="font-serif text-lg text-ink">
          {titulo}
        </h2>
        {mensaje && (
          <p id="confirm-dialog-mensaje" className="mt-2 text-[13px] leading-relaxed text-muted">
            {mensaje}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-lg border border-line-strong px-4 py-[9px] text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink"
          >
            {textoCancelar}
          </button>
          <button
            ref={confirmarRef}
            type="button"
            onClick={onConfirmar}
            className={cn(
              'rounded-lg px-4 py-[9px] text-[13px] font-semibold text-bg transition-colors hover:opacity-90',
              destructivo ? 'bg-overdue' : 'bg-accent',
            )}
          >
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
