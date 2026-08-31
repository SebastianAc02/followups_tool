'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { confirmarResetPasswordAction } from './actions';

export default function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const form = new FormData(e.currentTarget);
      const nuevaPassword = String(form.get('nuevaPassword') ?? '');
      const confirmar = String(form.get('confirmar') ?? '');
      if (nuevaPassword !== confirmar) {
        setError('Las dos passwords no coinciden');
        return;
      }
      const res = await confirmarResetPasswordAction({ token, nuevaPassword });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setListo(true);
      setTimeout(() => router.push('/login'), 2000);
    } finally {
      setEnviando(false);
    }
  }

  if (!token) {
    return (
      <div className="ac-card ac-login">
        <div className="ac-inner ac-login-inner">
          <h2 className="ac-h big">Link inválido</h2>
          <p className="ac-sub">Este link no trae token. Pide uno nuevo desde &quot;Olvidé mi password&quot;.</p>
          <div className="ac-foot"><Link href="/olvide-password">Pedir un link nuevo</Link></div>
        </div>
      </div>
    );
  }

  return (
    <div className="ac-card ac-login">
      <div className="ac-inner ac-login-inner">
        <div className="ac-brand" style={{ marginBottom: 0 }}>
          <span className="ac-brand-name">OnePay Cockpit</span>
        </div>

        {listo ? (
          <div className="ac-login-body">
            <h2 className="ac-h big">Listo</h2>
            <p className="ac-sub">Tu password quedó actualizada. Te llevamos al login...</p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="ac-login-body">
            <h2 className="ac-h big">Define tu password nueva</h2>

            <label className="ac-label" htmlFor="nuevaPassword">Password nueva</label>
            <div className="ac-field">
              <input id="nuevaPassword" name="nuevaPassword" type="password" placeholder="••••••••" required minLength={8} autoFocus />
            </div>

            <label className="ac-label" htmlFor="confirmar">Confírmala</label>
            <div className="ac-field">
              <input id="confirmar" name="confirmar" type="password" placeholder="••••••••" required minLength={8} />
            </div>

            {error && <div className="ac-error">{error}</div>}

            <button className="ac-btn" disabled={enviando}>
              {enviando ? 'Guardando...' : 'Guardar password nueva'}
            </button>
          </form>
        )}

        <div className="ac-foot">
          <Link href="/login">Volver a iniciar sesión</Link>
        </div>
      </div>
    </div>
  );
}
