import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from './auth';
import { usuarioDeSesion, type UsuarioSesion } from './session-user';

// Gate de sesion (V2.2): toda pagina y todo server action lo llaman primero.
// Sin sesion valida no se ve ni se escribe nada.
export async function requireSession(): Promise<UsuarioSesion> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  return usuarioDeSesion(session.user as Parameters<typeof usuarioDeSesion>[0]);
}
