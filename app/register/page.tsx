import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '../lib/auth';

// Registro cerrado (2026-07-14, ver auth.ts): no llamar ownersDisponibles aca --
// listaba nombres reales del equipo a cualquier visitante anonimo, gate o no gate.
export default async function RegisterPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect('/');

  return (
    <div className="auth-cockpit">
      <div className="ac-card">
        <div className="ac-inner">
          <h2 className="ac-h med">Registro cerrado</h2>
          <p className="ac-sub">Las cuentas nuevas las crea Sebastián a mano. Pídele acceso.</p>
          <div className="ac-foot">
            <Link href="/login">Ir a iniciar sesión</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
