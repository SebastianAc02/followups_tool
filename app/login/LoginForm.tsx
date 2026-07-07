'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '../lib/auth-client';

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [recordar, setRecordar] = useState(true);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const form = new FormData(e.currentTarget);
      const { error } = await authClient.signIn.email({
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
        rememberMe: recordar,
      });
      if (error) {
        setError('Correo o password incorrectos');
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="ac-card ac-login">
      <div className="ac-inner ac-login-inner">
        <div className="ac-brand" style={{ marginBottom: 0 }}>
          <div className="ac-brand-mark">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="8" stroke="#0b0d10" strokeWidth="2" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="#0b0d10" strokeWidth="2" />
              <circle cx="12" cy="12" r="2" fill="#0b0d10" />
            </svg>
          </div>
          <span className="ac-brand-name">OnePay Cockpit</span>
        </div>

        <form onSubmit={onSubmit} className="ac-login-body">
          <h2 className="ac-h big">Retoma el mando</h2>
          <p className="ac-sub">Tu cola del día te está esperando.</p>

          <label className="ac-label" htmlFor="email">Correo</label>
          <div className="ac-field">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="#5b636e" strokeWidth="1.6" />
              <path d="M4 7l8 6 8-6" stroke="#5b636e" strokeWidth="1.6" />
            </svg>
            <input id="email" name="email" type="email" placeholder="ana@onepay.co" required autoFocus />
          </div>

          <label className="ac-label" htmlFor="password">Contraseña</label>
          <div className="ac-field">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <rect x="5" y="11" width="14" height="9" rx="2" stroke="#5b636e" strokeWidth="1.6" />
              <path d="M8 11V8a4 4 0 018 0v3" stroke="#5b636e" strokeWidth="1.6" />
            </svg>
            <input id="password" name="password" type="password" placeholder="••••••••" required />
          </div>

          <label className="ac-remember">
            <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} />
            Recordar sesión
          </label>

          {error && <div className="ac-error">{error}</div>}

          <button className="ac-btn" disabled={enviando}>
            {enviando ? 'Entrando...' : 'Iniciar sesión'}
          </button>
        </form>

        <div className="ac-foot">
          <span className="muted">¿Sin cuenta? </span>
          <Link href="/register">Crear una</Link>
        </div>
      </div>
    </div>
  );
}
