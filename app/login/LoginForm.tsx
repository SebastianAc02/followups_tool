'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '../lib/auth-client';

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const form = new FormData(e.currentTarget);
      const { error } = await authClient.signIn.email({
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
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
      {error && <div className="login-error">{error}</div>}
      <button className="rep-btn login-btn" disabled={enviando}>
        {enviando ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  );
}
