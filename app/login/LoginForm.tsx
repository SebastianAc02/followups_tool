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
    <form onSubmit={onSubmit} className="login-form">
      <input name="email" type="email" placeholder="Correo" required autoFocus />
      <input name="password" type="password" placeholder="Password" required />
      <label className="login-remember">
        <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} />
        Recordar sesión
      </label>
      {error && <div className="login-error">{error}</div>}
      <button className="rep-btn login-btn" disabled={enviando}>
        {enviando ? 'Entrando...' : 'Entrar'}
      </button>
      <Link href="/register" className="login-link">¿No tienes cuenta? Crear cuenta</Link>
    </form>
  );
}
