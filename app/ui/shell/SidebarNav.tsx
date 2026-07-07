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
};

const BADGE_TONE: Record<NonNullable<NavItem['badgeTone']>, string> = {
  neutral: 'bg-surface-2 text-muted',
  done: 'bg-done/10 text-done',
  overdue: 'bg-overdue/10 text-overdue',
};

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const activo = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cx(
              'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
              activo
                ? 'bg-nav font-semibold text-nav-ink'
                : 'text-[#9ca0ab] hover:bg-card-hover hover:text-ink',
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
