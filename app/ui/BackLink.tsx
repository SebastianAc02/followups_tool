// Link de "volver" on-design (Fix 4, 2026-07-08): reemplaza la clase legacy .back
// (solo texto gris, sin afordancia) y el "← Inicio" suelto de conectores. Icono + texto
// en una píldora con hover, mismos tokens que botones/pills del resto de la app.
import Link from 'next/link';

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1.5 text-sm text-muted transition-colors hover:border-line-card hover:bg-card hover:text-ink"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M15 5 8 12l7 7" />
      </svg>
      {label}
    </Link>
  );
}
