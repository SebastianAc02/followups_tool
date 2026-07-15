'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { reclamarMembresiaAction } from './actions';
import { OWNERS_ONEPAY } from '../register/owners';

// Mismo paso 2 de RegisterForm, sin las pantallas de credenciales (ya hay sesion): esta
// pantalla solo falta decidir a que organizacion cae el usuario.
export default function ReclamarForm() {
  const router = useRouter();
  const [soyOnepay, setSoyOnepay] = useState<boolean | null>(null);
  const [ownerElegido, setOwnerElegido] = useState('');
  const [nombreVisitante, setNombreVisitante] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const puedeEnviar = soyOnepay === true ? ownerElegido !== '' : soyOnepay === false ? nombreVisitante.trim() !== '' : false;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const input =
        soyOnepay === true
          ? { tipo: 'onepay' as const, ownerElegido }
          : { tipo: 'visitante' as const, nombreVisitante };
      const resultado = await reclamarMembresiaAction(input);
      if (!resultado.ok) {
        setError(resultado.error);
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
    <div className="ac-card">
      <div className="ac-inner">
        <form onSubmit={onSubmit}>
          <h2 className="ac-h med">Falta un paso</h2>
          <p className="ac-sub">Tu cuenta existe pero todavía no tiene organización asignada. ¿Eres del equipo OnePay?</p>

          <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
            <button
              type="button"
              className="ac-btn"
              style={{
                flex: 1,
                opacity: soyOnepay === true ? 1 : 0.5,
                outline: soyOnepay === true ? '2px solid #3ddc8b' : 'none',
                outlineOffset: 2,
              }}
              onClick={() => { setSoyOnepay(true); setError(null); }}
            >
              Sí, soy de OnePay
            </button>
            <button
              type="button"
              className="ac-btn"
              style={{
                flex: 1,
                background: '#232a31',
                color: '#e7ecef',
                opacity: soyOnepay === false ? 1 : 0.5,
                outline: soyOnepay === false ? '2px solid #3ddc8b' : 'none',
                outlineOffset: 2,
              }}
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
            {enviando ? 'Guardando...' : 'Entrar a la cabina'}
          </button>
        </form>
      </div>
    </div>
  );
}
