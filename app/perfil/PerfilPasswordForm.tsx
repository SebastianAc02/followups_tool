'use client';

// Isla cliente Fase 2: cambio de password directo contra Better Auth (authClient),
// sin server action propia -- mismo patron que el logout en PerfilMenu.tsx. Better
// Auth valida la contraseña actual server-side; aca solo se valida forma (longitud,
// confirmacion) antes de mandar el request.
import { useState } from 'react';
import { authClient } from '../lib/auth-client';

export function PerfilPasswordForm() {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(false);

    if (nueva.length < 8) {
      setError('La contraseña nueva necesita al menos 8 caracteres.');
      return;
    }
    if (nueva !== confirmar) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setEnviando(true);
    try {
      const { error: errAuth } = await authClient.changePassword({
        currentPassword: actual,
        newPassword: nueva,
        revokeOtherSessions: true,
      });
      if (errAuth) {
        setError('No se pudo cambiar la contraseña. Revisa la contraseña actual.');
        return;
      }
      setOk(true);
      setActual('');
      setNueva('');
      setConfirmar('');
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="text-[13px] text-ink-soft">
      <div className="mb-2.5">
        <label className="mb-1 block text-[12px] font-semibold text-ink" htmlFor="pw-actual">
          Contraseña actual
        </label>
        <input
          id="pw-actual"
          type="password"
          required
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          className="w-full rounded-md border border-line-card bg-surface-2 px-2.5 py-1.5 text-[13px] text-ink"
        />
      </div>
      <div className="mb-2.5">
        <label className="mb-1 block text-[12px] font-semibold text-ink" htmlFor="pw-nueva">
          Contraseña nueva
        </label>
        <input
          id="pw-nueva"
          type="password"
          required
          minLength={8}
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          className="w-full rounded-md border border-line-card bg-surface-2 px-2.5 py-1.5 text-[13px] text-ink"
        />
      </div>
      <div className="mb-3">
        <label className="mb-1 block text-[12px] font-semibold text-ink" htmlFor="pw-confirmar">
          Confirmar contraseña nueva
        </label>
        <input
          id="pw-confirmar"
          type="password"
          required
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
          className="w-full rounded-md border border-line-card bg-surface-2 px-2.5 py-1.5 text-[13px] text-ink"
        />
      </div>

      {error && <div className="mb-2 text-[12px] text-overdue">{error}</div>}
      {ok && <div className="mb-2 text-[12px] text-done">Contraseña actualizada.</div>}

      <button
        type="submit"
        disabled={enviando}
        className="rounded-md border border-line-card bg-surface-2 px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-card-hover disabled:opacity-50"
      >
        {enviando ? 'Guardando...' : 'Cambiar contraseña'}
      </button>
    </form>
  );
}
