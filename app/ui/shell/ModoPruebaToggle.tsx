'use client';

import { alternarModoPrueba } from './modo-prueba-actions';

// El banner no es decoracion: es la mitad de la seguridad del diseño. Sin señal visible el
// riesgo se invierte -- creerias estar en prueba estando en real, y le mandarias un correo
// a un ISP de verdad. Por eso en modo prueba ocupa espacio y no se puede ignorar.
export function ModoPruebaToggle({ activo }: { activo: boolean }) {
  if (!activo) {
    return (
      <button
        type="button"
        onClick={() => alternarModoPrueba(true)}
        className="rounded-md border border-line-card px-2.5 py-1 text-[12px] text-faint transition-colors hover:text-muted"
      >
        Modo prueba
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md bg-pending-soft px-3 py-1 text-pending ring-1 ring-pending/40">
      <span className="h-[7px] w-[7px] rounded-full bg-pending" />
      <span className="text-[12px] font-semibold tracking-wide">MODO PRUEBA · pruebas.db</span>
      <button
        type="button"
        onClick={() => alternarModoPrueba(false)}
        className="text-[12px] underline underline-offset-2 hover:no-underline"
      >
        Salir
      </button>
    </div>
  );
}
