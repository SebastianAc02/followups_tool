'use client';

// Sidebar del shell. Cliente: guarda si está expandido (pinned) en localStorage. Colapsado
// se muestra como riel de íconos (estático, sin flyout): el riel siempre está visible y empuja
// el contenido igual que el sidebar completo. Recibe los datos ya resueltos (nav items,
// conectores, owner) desde AppShell (server).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SidebarNav, type NavItem } from './SidebarNav';
import { IconSidebarToggle } from './icons';
import { cx } from '../cx';

export type ConectorEstado = {
  nombre: string;
  detalle: string;
  tone: 'done' | 'overdue' | 'today';
};

const DOT_TONE: Record<ConectorEstado['tone'], string> = {
  done: 'bg-done shadow-[0_0_8px_rgba(87,201,138,0.6)]',
  overdue: 'bg-overdue shadow-[0_0_8px_rgba(244,121,107,0.6)]',
  today: 'bg-today shadow-[0_0_8px_rgba(242,183,56,0.6)]',
};

const STORAGE_KEY = 'onepay:sidebar:pinned';

export function Sidebar({
  ownerNombre,
  items,
  conectores,
}: {
  ownerNombre: string;
  items: NavItem[];
  conectores: ConectorEstado[];
}) {
  const [pinned, setPinned] = useState(true);

  useEffect(() => {
    const guardado = window.localStorage.getItem(STORAGE_KEY);
    if (guardado === '0') setPinned(false);
  }, []);

  function alternarPin() {
    setPinned((actual) => {
      const siguiente = !actual;
      window.localStorage.setItem(STORAGE_KEY, siguiente ? '1' : '0');
      return siguiente;
    });
  }

  // Riel colapsado: mismo ancho de flex-none que el completo, solo que angosto (64px). Al
  // estar siempre en el flujo empuja el contenido igual que el sidebar completo -- sin overlay,
  // sin flyout, sin z-index. Ver decisión de Sebastián (2026-07-11): riel estático.
  if (!pinned) {
    return (
      <div className="flex h-screen w-16 flex-none flex-col items-center border-r border-line-shell bg-shell-2 py-4">
        <Link
          href="/perfil"
          title="OnePay"
          className="mb-3 flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-gradient-to-br from-accent to-accent-deep text-[15px] font-extrabold text-white shadow-[0_2px_10px_rgba(139,124,255,0.4)]"
        >
          O
        </Link>
        <button
          type="button"
          onClick={alternarPin}
          title="Fijar sidebar"
          className="mb-4 flex h-10 w-10 items-center justify-center rounded-[11px] text-faint hover:bg-card-hover hover:text-ink"
        >
          <IconSidebarToggle className="h-[17px] w-[17px]" />
        </button>

        <SidebarNav items={items} collapsed />

        {/* Conectores como puntos de estado (sin texto) al pie del riel. */}
        <div className="mt-auto flex flex-col items-center gap-2.5 border-t border-line-shell pt-3.5">
          {conectores.map((c) => (
            <span
              key={c.nombre}
              title={`${c.nombre}: ${c.detalle}`}
              className={`h-[7px] w-[7px] rounded-full ${DOT_TONE[c.tone]}`}
            />
          ))}
        </div>
      </div>
    );
  }

  // Expandido: en el flujo del flex, empuja el contenido. h-screen explícito para que el
  // bloque de conectores (mt-auto) tenga la misma altura de referencia que el riel y no salte
  // al alternar. Push permanente a pedido de Sebastián (2026-07-08): nada de overlay.
  return (
    <div className="relative flex h-screen w-[250px] flex-none flex-col border-r border-line-shell bg-shell-2 px-3 py-4">
      {/* Workspace switcher */}
      <div className="mb-[18px] flex items-center gap-2.5">
        <Link href="/perfil" className="flex flex-1 items-center gap-2.5 rounded-[11px] px-2.5 py-2 hover:bg-card-hover">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-gradient-to-br from-accent to-accent-deep text-[14px] font-extrabold text-white shadow-[0_2px_10px_rgba(139,124,255,0.4)]">
            O
          </span>
          <div className="flex-1 leading-[1.15]">
            <div className="text-[13.5px] font-semibold text-ink">OnePay</div>
            <div className="text-[11px] text-faint">{ownerNombre}</div>
          </div>
        </Link>
        <button
          type="button"
          onClick={alternarPin}
          title="Ocultar sidebar"
          className="flex h-7 w-7 flex-none items-center justify-center rounded-[8px] text-faint hover:bg-card-hover hover:text-ink"
        >
          <IconSidebarToggle className="h-[15px] w-[15px]" />
        </button>
      </div>

      <div className="mb-2 px-2.5 text-[10.5px] uppercase tracking-[0.16em] text-faint">Módulos</div>

      <SidebarNav items={items} />

      {/* Conectores mini-panel */}
      <div className="mt-auto border-t border-line-shell px-2.5 pb-1 pt-3.5">
        <div className="mb-[11px] text-[10.5px] uppercase tracking-[0.16em] text-faint">Conectores</div>
        {conectores.map((c) => (
          <div key={c.nombre} className="mb-[9px] flex items-center gap-2.5">
            <span className={`h-[7px] w-[7px] rounded-full ${DOT_TONE[c.tone]}`} />
            <span className="flex-1 text-[12.5px] text-ink-soft">{c.nombre}</span>
            <span className="text-[11px] text-faint">{c.detalle}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
