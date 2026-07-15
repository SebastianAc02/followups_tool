import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '../lib/auth';
import { organizacionDeUsuario } from '../db/organizacion-repository';
import ReclamarForm from './ReclamarForm';

// Destino de rescate de requireSession (Task 2): un usuario autenticado sin membresia
// (registro no atomico interrumpido, o un zombi viejo de produccion) llega aca en vez de
// ver un 500. Chequea sesion directo con auth.api.getSession, NUNCA requireSession -- esa
// funcion es la que redirige para aca, llamarla de nuevo seria un loop.
export default async function ReclamarPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  if (organizacionDeUsuario(session.user.id)) redirect('/');

  return (
    <div className="auth-cockpit">
      <ReclamarForm />
    </div>
  );
}
