'use client';

// Sub-nav del panel de control de una campana (Task 10.1, Fase 10). Tabs horizontales,
// mas chicas que el SidebarNav del shell principal -- no es otro sidebar, es la
// navegacion entre las sub-vistas que ya existen para ESTA campana (Resumen aqui mismo,
// Cadencia/Reglas/Destinatarios/Lanzar en sus propias rutas). Client component porque
// necesita usePathname para resaltar el tab activo, igual que SidebarNav.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '../../ui/cx';
import type { SubNavItem } from './subnav-items';

export type { SubNavItem };

export function CampanaSubNav({ items }: { items: SubNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex gap-1 border-b border-line" aria-label="Navegación de la campaña">
      {items.map((item) => {
        const activo = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cx(
              'px-3 py-2.5 text-sm transition-colors',
              activo
                ? 'border-b-2 border-accent font-semibold text-ink'
                : 'border-b-2 border-transparent text-muted hover:text-ink',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
