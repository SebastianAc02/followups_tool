'use client';

// Tarjeta de identidad de /perfil. Patron visual de referencia: mockup "Nodalis
// Cockpit" (~/Arc/Profile Follow Up Tool), adaptado a los tokens y datos reales de
// este cockpit -- NO se copian campos ni el modelo de roles del mockup que no existen
// aca (ver decision 2026-07-08 en la sesion que agrego cargo/telefono).
//
// Nombre, correo y rol son SIEMPRE de solo lectura: nombre/rol vienen de Better Auth
// (identidad.owner/admin, "input:false" -- ver app/lib/auth.ts) y correo es la
// identidad de login, cambiarlo es un flujo aparte y mas sensible (fuera de alcance).
// Solo cargo y telefono son editables (preferencia_usuario, contacto local).
//
// El selector de rol es SOLO VISUAL: son <span>, no <button>, a proposito -- el rol
// real es un booleano que solo cambia un admin o un script (ver
// app/db/organizacion-repository.ts), nunca el propio usuario. Dejarlo clickeable
// aunque no hiciera nada seria enganoso (pareceria que se puede auto-promover).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cx } from '../ui/cx';
import { claseAvatar } from '../ui/shell/avatar-colores';
import { guardarPreferenciasAction } from './actions';

export function PerfilIdentidadCard({
  nombre,
  email,
  iniciales,
  colorAvatar,
  rol,
  admin,
  cargoInicial,
  telefonoInicial,
}: {
  nombre: string;
  email: string;
  iniciales: string;
  colorAvatar: string;
  rol: string;
  admin: boolean;
  cargoInicial: string;
  telefonoInicial: string;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [cargo, setCargo] = useState(cargoInicial);
  const [telefono, setTelefono] = useState(telefonoInicial);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function cancelar() {
    setCargo(cargoInicial);
    setTelefono(telefonoInicial);
    setError(null);
    setEditando(false);
  }

  async function guardar() {
    setError(null);
    setGuardando(true);
    try {
      const resultado = await guardarPreferenciasAction({ cargo, telefono });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setEditando(false);
      router.refresh();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line-card bg-card">
      <div className="flex items-center gap-2 border-b border-line-card px-5 py-3">
        <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Identidad</div>
        <div className="ml-auto flex items-center gap-2">
          {editando ? (
            <>
              <button
                type="button"
                onClick={cancelar}
                disabled={guardando}
                className="rounded-md border border-line-card px-3 py-1.5 text-[12.5px] font-semibold text-ink-soft hover:bg-card-hover disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardar}
                disabled={guardando}
                className="rounded-md border border-accent bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:opacity-90 disabled:opacity-50"
              >
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="rounded-md border border-line-card px-3 py-1.5 text-[12.5px] font-semibold text-ink-soft hover:bg-card-hover"
            >
              Editar
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 px-5 py-4">
        <span
          className={cx(
            'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-line-card text-[14px] font-bold text-ink-soft',
            claseAvatar(colorAvatar),
          )}
        >
          {iniciales}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-ink">{nombre}</div>
          {editando ? (
            <input
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
              placeholder="Cargo (ej. Ejecutivo comercial)"
              maxLength={80}
              className="mt-1 w-full max-w-[260px] rounded-md border border-line-card bg-surface-2 px-2 py-1 text-[12.5px] text-ink"
            />
          ) : (
            <div className="mt-0.5 text-[12.5px] text-faint">{cargo || 'Sin cargo asignado'}</div>
          )}
        </div>
      </div>

      <div className="border-b border-t border-line-card px-5 py-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Rol</div>
        <div className="inline-flex gap-1 rounded-lg border border-line-card bg-surface-2 p-1" aria-label={`Rol actual: ${rol}`}>
          <span
            className={cx(
              'rounded-md px-3 py-1.5 text-[12.5px] font-medium',
              !admin ? 'bg-accent-bg text-accent-ink font-semibold' : 'text-faint',
            )}
          >
            Vendedor
          </span>
          <span
            className={cx(
              'rounded-md px-3 py-1.5 text-[12.5px] font-medium',
              admin ? 'bg-accent-bg text-accent-ink font-semibold' : 'text-faint',
            )}
          >
            Administrador
          </span>
        </div>
      </div>

      <div className="px-5 py-4">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Contacto</div>
        <div className="flex flex-col gap-3 text-[13px]">
          <div className="flex items-center justify-between">
            <span className="text-faint">Correo</span>
            <span className="font-medium text-ink">{email}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-faint">Teléfono</span>
            {editando ? (
              <input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+57 300 000 0000"
                maxLength={30}
                className="w-[220px] rounded-md border border-line-card bg-surface-2 px-2.5 py-1.5 text-[13px] text-ink"
              />
            ) : (
              <span className="font-medium text-ink">{telefono || 'Sin teléfono'}</span>
            )}
          </div>
        </div>
      </div>

      {error && <div className="px-5 pb-4 text-[12px] text-overdue">{error}</div>}
    </div>
  );
}
