import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '../lib/auth';
import RegisterForm from './RegisterForm';

// Reabierto (2026-07-14, ver actions.ts y auth.ts): ya no llama ownersDisponibles (esa
// consulta derivaba la lista de la DB y exponia nombres reales / basura de datos a
// cualquier visitante anonimo). La lista de Onepay ahora es un array cerrado que vive en
// actions.ts, no algo que se resuelva contra datos reales en cada carga de la pagina.
export default async function RegisterPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect('/');

  return (
    <div className="auth-cockpit">
      <RegisterForm />
    </div>
  );
}
