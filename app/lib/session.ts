import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from './auth';
import { usuarioDeSesion, type UsuarioSesion } from './session-user';
import { organizacionDeUsuario } from '../db/organizacion-repository';
import { marcarSoloLectura, ErrorSoloLectura } from './read-only';

// id 1 = Onepay (seed_organizacion.ts). Un visitante (org "Visitantes") lee los datos
// reales de OnePay: su sesion reporta esta organizacion para las lecturas, aunque su
// membresia real sea la de Visitantes.
const ID_ORGANIZACION_ONEPAY = 1;
const ORGANIZACION_VISITANTES = 'Visitantes';

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

  // Modo visitante (2026-07-14): miembro de "Visitantes" ve el pipeline real de OnePay
  // (idOrganizacion = OnePay) pero en solo-lectura. marcarSoloLectura se llama DESPUES de
  // getSession (para no bloquear el refresco de sesion de better-auth) y antes de que
  // cualquier escritura de esta request pueda correr -- el Proxy del db la hace cumplir.
  const soloLectura = membresia.nombreOrganizacion === ORGANIZACION_VISITANTES;
  marcarSoloLectura(soloLectura);
  const idOrganizacion = soloLectura ? ID_ORGANIZACION_ONEPAY : membresia.idOrganizacion;

  return usuarioDeSesion(session.user as Parameters<typeof usuarioDeSesion>[0], idOrganizacion, soloLectura);
}

// Gate de escritura: defensa explicita ADEMAS del Proxy del db, para las acciones que
// envian por adaptador (correo/WhatsApp via Apollo/Evolution) sin tocar la DB -- esas no
// las atrapa el Proxy. Un visitante recibe ErrorSoloLectura antes de que salga nada.
export async function requireEscritura(): Promise<UsuarioSesion> {
  const usuario = await requireSession();
  if (usuario.soloLectura) throw new ErrorSoloLectura();
  return usuario;
}
