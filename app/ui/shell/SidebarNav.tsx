'use client';

// Isla cliente del sidebar: la única parte que necesita saber la ruta activa. Recibe los
// ítems ya armados (con su badge calculado en el server) y resalta el activo con usePathname.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cx } from '../cx';

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  badge?: string;
  badgeTone?: 'neutral' | 'done' | 'overdue';
  // Por defecto el ítem se marca activo con pathname.startsWith(href) (incluye sub-rutas).
  // exactMatch fuerza pathname === href -- para ítems cuyo flujo cruza a otro árbol de
  // ruta (ej. /campanas/nueva/**, /cadencias/[id]) y no debe quedar "encendido" fuera
  // del hub. Ver Fix 9, docs/superpowers/specs/2026-07-08-ui-fixes-plan.md.
  exactMatch?: boolean;
};

const BADGE_TONE: Record<NonNullable<NavItem['badgeTone']>, string> = {
  neutral: 'bg-surface-2 text-muted',
  done: 'bg-done/10 text-done',
  overdue: 'bg-overdue/10 text-overdue',
};

// `collapsed`: modo riel de íconos (sidebar colapsado). Mismos items, sin label ni badge --
// solo el ícono centrado + un puntito de atención cuando el item está en tono 'overdue' y
// tiene conteo. El nombre del módulo se ofrece como title nativo (tooltip del navegador).
export function SidebarNav({ items, collapsed = false }: { items: NavItem[]; collapsed?: boolean }) {
  const pathname = usePathname();

  if (collapsed) {
    return (
      <nav className="flex flex-col items-center gap-1">
        {items.map((item) => {
          const activo =
            item.href === '/' || item.exactMatch ? pathname === item.href : pathname.startsWith(item.href);
          const atencion = item.badgeTone === 'overdue' && item.badge && item.badge !== '0';
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-label={item.label}
              className={cx(
                'relative flex h-10 w-10 items-center justify-center rounded-[11px] transition-colors',
                activo
                  ? 'bg-accent/10 text-ink'
                  : 'text-nav-inactive hover:bg-card-hover hover:text-ink',
              )}
            >
              <span className="shrink-0 text-current">{item.icon}</span>
              {atencion && (
                <span className="absolute right-1.5 top-1.5 h-[7px] w-[7px] rounded-full bg-overdue shadow-[0_0_6px_rgba(244,121,107,0.7)]" />
              )}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const activo =
          item.href === '/' || item.exactMatch ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cx(
              'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
              activo
                ? 'bg-accent/10 font-semibold text-ink'
                : 'text-nav-inactive hover:bg-card-hover hover:text-ink',
            )}
          >
            {activo && (
              <span className="absolute -left-3 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
            )}
            <span className="shrink-0 text-current">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.badge && (
              <span
                className={cx(
                  'rounded-full px-2 py-px text-[11px] font-semibold',
                  BADGE_TONE[item.badgeTone ?? 'neutral'],
                )}
              >
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
