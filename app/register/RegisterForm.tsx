'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { registrarUsuarioAction, OWNERS_ONEPAY } from './actions';

export default function RegisterForm() {
  const router = useRouter();
  const [paso, setPaso] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [soyOnepay, setSoyOnepay] = useState<boolean | null>(null);
  const [ownerElegido, setOwnerElegido] = useState('');
  const [nombreVisitante, setNombreVisitante] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function irAPaso2(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmar) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setPaso(2);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const input =
        soyOnepay === true
          ? { tipo: 'onepay' as const, ownerElegido, email, password }
          : { tipo: 'visitante' as const, nombreVisitante, email, password };
      const resultado = await registrarUsuarioAction(input);
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

  const marca = (
    <div className="ac-brand">
      <div className="ac-brand-mark">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8" stroke="#0b0d10" strokeWidth="2" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="#0b0d10" strokeWidth="2" />
          <circle cx="12" cy="12" r="2" fill="#0b0d10" />
        </svg>
      </div>
      <span className="ac-brand-name">OnePay Cockpit</span>
    </div>
  );

  const puedeEnviar = soyOnepay === true ? ownerElegido !== '' : soyOnepay === false ? nombreVisitante.trim() !== '' : false;

  return (
    <div className="ac-card">
      <div className="ac-inner">
        {marca}

        <div className="ac-progress">
          <div className="ac-seg on" />
          <div className={`ac-seg ${paso === 2 ? 'on' : ''}`} />
          <span className="ac-step">{paso === 1 ? '01 / 02' : '02 / 02'}</span>
        </div>

        {paso === 1 && (
          <form onSubmit={irAPaso2}>
            <h2 className="ac-h med">Crea tu cuenta</h2>
            <p className="ac-sub">Primero tus credenciales. Luego nos dices quién eres.</p>

            <label className="ac-label" htmlFor="email">Correo</label>
            <div className="ac-field">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="5" width="18" height="14" rx="2" stroke="#5b636e" strokeWidth="1.6" />
                <path d="M4 7l8 6 8-6" stroke="#5b636e" strokeWidth="1.6" />
              </svg>
              <input id="email" type="email" placeholder="ana@onepay.co" required
                value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </div>

            <label className="ac-label" htmlFor="password">Contraseña</label>
            <div className="ac-field">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <rect x="5" y="11" width="14" height="9" rx="2" stroke="#5b636e" strokeWidth="1.6" />
                <path d="M8 11V8a4 4 0 018 0v3" stroke="#5b636e" strokeWidth="1.6" />
              </svg>
              <input id="password" type="password" placeholder="Mínimo 8 caracteres" required minLength={8}
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            <label className="ac-label" htmlFor="confirmar">Confirmar contraseña</label>
            <div className="ac-field" style={{ marginBottom: 24 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <rect x="5" y="11" width="14" height="9" rx="2" stroke="#5b636e" strokeWidth="1.6" />
                <path d="M8 11V8a4 4 0 018 0v3" stroke="#5b636e" strokeWidth="1.6" />
              </svg>
              <input id="confirmar" type="password" placeholder="Repite la contraseña" required
                value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
            </div>

            {error && <div className="ac-error">{error}</div>}

            <button className="ac-btn">Continuar</button>
            <div className="ac-foot">
              <span className="muted">¿Ya tienes cuenta? </span>
              <Link href="/login">Inicia sesión</Link>
            </div>
          </form>
        )}

        {paso === 2 && (
          <form onSubmit={onSubmit}>
            <h2 className="ac-h med">Configura tu cabina</h2>
            <p className="ac-sub">Cuenta creada para <em>{email}</em>. ¿Eres del equipo OnePay?</p>

            <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
              <button
                type="button"
                className="ac-btn"
                style={{ opacity: soyOnepay === true ? 1 : 0.45 }}
                onClick={() => { setSoyOnepay(true); setError(null); }}
              >
                Sí, soy de OnePay
              </button>
              <button
                type="button"
                className="ac-btn"
                style={{ opacity: soyOnepay === false ? 1 : 0.45, background: '#232a31', color: '#e7ecef' }}
                onClick={() => { setSoyOnepay(false); setError(null); }}
              >
                No, soy visitante
              </button>
            </div>

            {soyOnepay === true && (
              <>
                <label className="ac-label" htmlFor="ownerElegido">Tu nombre en el pipeline</label>
                <div className="ac-field ac-select" style={{ marginBottom: 24 }}>
                  <select id="ownerElegido" required value={ownerElegido}
                    onChange={(e) => setOwnerElegido(e.target.value)}>
                    <option value="" disabled>Elige tu nombre</option>
                    {OWNERS_ONEPAY.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {soyOnepay === false && (
              <>
                <label className="ac-label" htmlFor="nombreVisitante">Tu nombre</label>
                <div className="ac-field" style={{ marginBottom: 24 }}>
                  <input id="nombreVisitante" type="text" placeholder="Como quieres que te veamos" required
                    value={nombreVisitante} onChange={(e) => setNombreVisitante(e.target.value)} />
                </div>
              </>
            )}

            {error && <div className="ac-error">{error}</div>}

            <button className="ac-btn" disabled={enviando || !puedeEnviar}>
              {enviando ? 'Creando cuenta...' : 'Entrar a la cabina'}
            </button>
            <button type="button" className="ac-back" onClick={() => { setError(null); setPaso(1); }}>
              Volver a datos de cuenta
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
