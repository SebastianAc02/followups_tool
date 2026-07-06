'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { registrarUsuarioAction } from './actions';

type Miembro = { id: number; nombreDisplay: string };

export default function RegisterForm({ miembros }: { miembros: Miembro[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const form = new FormData(e.currentTarget);
      const resultado = await registrarUsuarioAction({
        idMiembro: form.get('idMiembro'),
        email: form.get('email'),
        password: form.get('password'),
      });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      router.push('/login');
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  if (miembros.length === 0) {
    return (
      <div className="login-form">
        <div className="login-error">Ya no hay nombres libres para registrar. Habla con Sebastián.</div>
        <Link href="/login" className="login-link">Ir a iniciar sesión</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="login-form">
      <div className="register-org">Organización: Onepay</div>

      <label className="register-label" htmlFor="idMiembro">Quién eres tú</label>
      <select name="idMiembro" id="idMiembro" required defaultValue="">
        <option value="" disabled>Elige tu nombre</option>
        {miembros.map((m) => (
          <option key={m.id} value={m.id}>{m.nombreDisplay}</option>
        ))}
      </select>

      <input name="email" type="email" placeholder="Correo" required />
      <input name="password" type="password" placeholder="Contraseña (mínimo 8 caracteres)" required minLength={8} />
      {error && <div className="login-error">{error}</div>}
      <button className="rep-btn login-btn" disabled={enviando}>
        {enviando ? 'Creando cuenta...' : 'Crear cuenta'}
      </button>
      <Link href="/login" className="login-link">¿Ya tienes cuenta? Inicia sesión</Link>
    </form>
  );
}
