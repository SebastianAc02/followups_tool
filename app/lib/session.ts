import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from './auth';
import { usuarioDeSesion, type UsuarioSesion } from './session-user';
import { organizacionDeUsuario } from '../db/organizacion-repository';

// Gate de sesion (V2.2): toda pagina y todo server action lo llaman primero.
// Sin sesion valida no se ve ni se escribe nada.
export async function requireSession(): Promise<UsuarioSesion> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  // Multi-organizacion (Parte 1): todo usuario que completo el registro (reclamo un
  // owner_canonico) tiene una fila en organizacion_miembro. Si no la tiene, es un
  // estado inconsistente (usuario autenticado sin organizacion) -- falla fuerte en vez
  // de asignar una organizacion por defecto en silencio.
  const membresia = organizacionDeUsuario(session.user.id);
  if (!membresia) {
    throw new Error(`Usuario ${session.user.id} autenticado sin organizacion asignada`);
  }

  return usuarioDeSesion(session.user as Parameters<typeof usuarioDeSesion>[0], membresia.idOrganizacion);
}
