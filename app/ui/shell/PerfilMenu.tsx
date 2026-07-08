'use client';

// Isla cliente: el avatar del TopBar pasa de <span> estatico a este boton con
// dropdown. Recibe el Perfil ya resuelto (server); aca solo maneja el estado de
// abierto/cerrado y el logout (authClient.signOut(), gemelo de app/SignOutButton.tsx,
// que queda huerfano despues de este cambio).
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '../../lib/auth-client';
import type { Perfil } from '../../core/perfil';
import { claseAvatar } from './avatar-colores';
import { cx } from '../cx';

export function PerfilMenu({ perfil }: { perfil: Perfil }) {
  const [abierto, setAbierto] = useState(false);
  const router = useRouter();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function cerrarSiClickAfuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', cerrarSiClickAfuera);
    return () => document.removeEventListener('mousedown', cerrarSiClickAfuera);
  }, []);

  async function cerrarSesion() {
    await authClient.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={cx('flex h-8 w-8 items-center justify-center rounded-full border border-line-card text-[12px] font-bold text-ink-soft', claseAvatar(perfil.colorAvatar))}
      >
        {perfil.iniciales}
      </button>

      {abierto && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-64 rounded-[11px] border border-line-card bg-card p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.35)]">
          <div className="px-3 py-2.5">
            <div className="text-[13.5px] font-semibold text-ink">{perfil.nombre}</div>
            <div className="mt-0.5 text-[12px] text-faint">{perfil.email}</div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.1em] text-muted">{perfil.rol}</div>
          </div>
          <div className="my-1 border-t border-line-card" />
          <Link
            href="/perfil"
            onClick={() => setAbierto(false)}
            className="block rounded-[8px] px-3 py-2 text-[13px] text-ink-soft hover:bg-card-hover"
          >
            Ver perfil
          </Link>
          <button
            type="button"
            onClick={cerrarSesion}
            className="block w-full rounded-[8px] px-3 py-2 text-left text-[13px] text-ink-soft hover:bg-card-hover"
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
