'use client';

import { useCallback, useRef, useState } from 'react';
import { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog';

export type ConfirmOptions = Omit<ConfirmDialogProps, 'onConfirmar' | 'onCancelar'>;

// Hook que reemplaza "if (!confirm('...')) return" por "if (!(await confirmar({...})))
// return" -- misma forma de usarlo (await a un boolean), pero renderiza ConfirmDialog
// en vez del dialogo nativo del navegador. `elemento` se pinta donde sea que el
// componente lo ponga en su JSX (normalmente al final, junto a los demas overlays).
export function useConfirm() {
  const [opciones, setOpciones] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const confirmar = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setOpciones(opts);
    return new Promise((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  function resolver(valor: boolean) {
    resolverRef.current?.(valor);
    resolverRef.current = null;
    setOpciones(null);
  }

  const elemento = opciones ? (
    <ConfirmDialog {...opciones} onConfirmar={() => resolver(true)} onCancelar={() => resolver(false)} />
  ) : null;

  return { confirmar, elemento };
}
