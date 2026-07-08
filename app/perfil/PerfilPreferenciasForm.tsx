'use client';

// Isla cliente Fase 2: edita color de avatar y vista de inicio. Recibe los valores
// actuales como props (server); guarda via guardarPreferenciasAction y refresca la
// ruta para que TopBar/PerfilMenu (server) recojan el Perfil actualizado.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cx } from '../ui/cx';
import { claseAvatar, COLOR_AVATAR_OPCIONES } from '../ui/shell/avatar-colores';
import { VISTA_INICIO_OPCIONES } from '../ui/shell/vista-inicio';
import { guardarPreferenciasAction } from './actions';

export function PerfilPreferenciasForm({
  colorAvatarInicial,
  vistaInicioInicial,
}: {
  colorAvatarInicial: string;
  vistaInicioInicial: string;
}) {
  const router = useRouter();
  const [colorAvatar, setColorAvatar] = useState(colorAvatarInicial);
  const [vistaInicio, setVistaInicio] = useState(vistaInicioInicial);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [pendiente, iniciarTransicion] = useTransition();

  function guardar(cambios: { colorAvatar?: string; vistaInicio?: string }) {
    setError(null);
    setGuardado(false);
    iniciarTransicion(async () => {
      const resultado = await guardarPreferenciasAction(cambios);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setGuardado(true);
      router.refresh();
    });
  }

  return (
    <div className="text-[13px] text-ink-soft">
      <div className="mb-3">
        <div className="mb-2 text-[12px] font-semibold text-ink">Color del avatar</div>
        <div className="flex gap-2">
          {COLOR_AVATAR_OPCIONES.map((o) => (
            <button
              key={o.id}
              type="button"
              title={o.nombre}
              disabled={pendiente}
              onClick={() => {
                setColorAvatar(o.id);
                guardar({ colorAvatar: o.id });
              }}
              className={cx(
                'h-8 w-8 rounded-full border-2 transition-colors',
                claseAvatar(o.id),
                colorAvatar === o.id ? 'border-ink' : 'border-transparent',
              )}
            />
          ))}
        </div>
      </div>

      <div className="mb-1">
        <label className="mb-2 block text-[12px] font-semibold text-ink" htmlFor="vista-inicio">
          Vista de inicio
        </label>
        <select
          id="vista-inicio"
          value={vistaInicio}
          disabled={pendiente}
          onChange={(e) => {
            setVistaInicio(e.target.value);
            guardar({ vistaInicio: e.target.value });
          }}
          className="rounded-md border border-line-card bg-surface-2 px-2.5 py-1.5 text-[13px] text-ink"
        >
          {VISTA_INICIO_OPCIONES.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="mt-2 text-[12px] text-overdue">{error}</div>}
      {guardado && !error && <div className="mt-2 text-[12px] text-done">Guardado.</div>}
    </div>
  );
}
