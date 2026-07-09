'use client';

// Sidebar del shell. Cliente: guarda si está fijado (pinned) en localStorage y, cuando está
// oculto, se abre como flyout al pasar el mouse por el borde izquierdo. Recibe los datos ya
// resueltos (nav items, conectores, owner) desde AppShell (server).
import { useEffect, useRef, useState } from 'react';
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
  const [hoverOpen, setHoverOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const guardado = window.localStorage.getItem(STORAGE_KEY);
    if (guardado === '0') setPinned(false);
  }, []);

  function alternarPin() {
    setPinned((actual) => {
      const siguiente = !actual;
      window.localStorage.setItem(STORAGE_KEY, siguiente ? '1' : '0');
      if (siguiente) setHoverOpen(false);
      return siguiente;
    });
  }

  function abrirPorHover() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setHoverOpen(true);
  }

  function cerrarPorHover() {
    closeTimer.current = setTimeout(() => setHoverOpen(false), 200);
  }

  const abierto = pinned || hoverOpen;

  return (
    <div onMouseEnter={!pinned ? abrirPorHover : undefined} onMouseLeave={!pinned ? cerrarPorHover : undefined}>
      {/* franja de borde: dispara el flyout aunque el sidebar esté oculto. Ancho generoso
          (24px, no 12px) para que no haya que clavar el mouse en el filo exacto de la
          pantalla. z-[60] a proposito, por encima de cualquier header sticky de pagina
          para que nunca le robe los eventos de mouse. */}
      {!pinned && <div className="fixed left-0 top-0 z-[60] h-full w-6" />}

      {/* Fijado (pinned/"sticky"): en el flujo del flex, empuja el contenido. No fijado:
          flyout fixed/overlay -- se abre encima del contenido sin moverlo, y solo se ve si
          abierto (hover). Vuelto a este comportamiento a pedido explícito de Sebastián
          (2026-07-08): el push permanente solo debe pasar cuando el sidebar está fijado. */}
      <div
        className={cx(
          // h-screen explícito en los dos estados (no depender del stretch del flex padre):
          // así el bloque de conectores (mt-auto) queda a la misma altura de referencia
          // tanto fijado como en flyout, y no "salta" al cambiar de estado.
          'flex h-screen w-[250px] flex-none flex-col border-r border-line-shell bg-shell-2 px-3 py-4 transition-transform duration-200 ease-out',
          pinned
            ? 'relative'
            : 'fixed left-0 top-0 z-50 shadow-[0_0_32px_rgba(0,0,0,0.35)]',
          !pinned && !abierto && '-translate-x-full',
        )}
      >
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
            title={pinned ? 'Ocultar sidebar' : 'Fijar sidebar'}
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
    </div>
  );
}
