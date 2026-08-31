'use client';

import { useState } from 'react';
import Link from 'next/link';
import { solicitarResetPasswordAction } from './actions';

export default function OlvidePasswordForm() {
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [urlDev, setUrlDev] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    try {
      const form = new FormData(e.currentTarget);
      const res = await solicitarResetPasswordAction(String(form.get('email') ?? ''));
      setEnviado(true);
      setUrlDev(res.urlResetSoloDev ?? null);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="ac-card ac-login">
      <div className="ac-inner ac-login-inner">
        <div className="ac-brand" style={{ marginBottom: 0 }}>
          <span className="ac-brand-name">OnePay Cockpit</span>
        </div>

        {enviado ? (
          <div className="ac-login-body">
            <h2 className="ac-h big">Revisa tu correo</h2>
            <p className="ac-sub">
              Si el correo existe en la herramienta, te llega un link para definir una password nueva.
              El link vence en 45 minutos y solo sirve una vez.
            </p>
            {urlDev && (
              <p className="ac-sub" style={{ wordBreak: 'break-all' }}>
                <strong>Solo dev/test (no hay envio de correo real configurado todavia):</strong>{' '}
                <a href={urlDev}>{urlDev}</a>
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={onSubmit} className="ac-login-body">
            <h2 className="ac-h big">Olvidé mi password</h2>
            <p className="ac-sub">Escribe tu correo y te mandamos un link para definir una password nueva.</p>

            <label className="ac-label" htmlFor="email">Correo</label>
            <div className="ac-field">
              <input id="email" name="email" type="email" placeholder="ana@onepay.co" required autoFocus />
            </div>

            <button className="ac-btn" disabled={enviando}>
              {enviando ? 'Enviando...' : 'Mandar link'}
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
