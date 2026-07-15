import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from './auth';
import { usuarioDeSesion, type UsuarioSesion } from './session-user';
import { organizacionDeUsuario } from '../db/organizacion-repository';
import { marcarSoloLectura, ErrorSoloLectura } from './read-only';
import { marcarModoPrueba } from './modo-prueba';
import { leerCookieModoPrueba } from './cookie-modo';
import { marcarOffsetDias } from './reloj';
import { leerCookieOffsetDemo } from './cookie-reloj';
import { resolverMembresia } from './resolucion-sesion';

// Gate de sesion (V2.2): toda pagina y todo server action lo llaman primero.
// Sin sesion valida no se ve ni se escribe nada.
export async function requireSession(): Promise<UsuarioSesion> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  // El modo se marca ANTES del primer acceso a `db` conmutable. getSession (arriba) y
  // organizacionDeUsuario (abajo) leen dbReal fijo, asi que no dependen de esta marca --
  // pero cualquier query de negocio de esta request si. esModoPrueba() no tiene default:
  // sin esta linea, toda pagina lanzaria.
  marcarModoPrueba(await leerCookieModoPrueba());

  // El offset del reloj de demo se marca junto al modo: hoy() en las paginas RSC lo lee.
  // Va despues de marcarModoPrueba porque offsetActual() lo consulta (solo aplica en
  // prueba). En una request normal la cookie no existe y el offset es 0.
  marcarOffsetDias(await leerCookieOffsetDemo());

  // Multi-organizacion (Parte 1): todo usuario que completo el registro (reclamo un
  // owner_canonico) tiene una fila en organizacion_miembro. Si no la tiene -- un usuario
  // autenticado sin organizacion, sea por el registro no atomico (Task 1) o por un zombi
  // viejo de produccion -- se le rescata mandandolo a reclamar, nunca se revienta la
  // pagina con un throw (eso era un 500 permanente sin salida, ver memoria
  // cuentas-zombi-registro).
  const membresia = organizacionDeUsuario(session.user.id);
  const resolucion = resolverMembresia(membresia);
  if (resolucion.tipo === 'sin-membresia') redirect('/reclamar');

  // marcarSoloLectura se llama DESPUES de getSession (para no bloquear el refresco de
  // sesion de better-auth) y antes de que cualquier escritura de esta request pueda
  // correr -- el Proxy del db la hace cumplir.
  marcarSoloLectura(resolucion.soloLectura);

  return usuarioDeSesion(session.user as Parameters<typeof usuarioDeSesion>[0], resolucion.idOrganizacion, resolucion.soloLectura);
}

// Gate de escritura: defensa explicita ADEMAS del Proxy del db, para las acciones que
// envian por adaptador (correo/WhatsApp via Apollo/Evolution) sin tocar la DB -- esas no
// las atrapa el Proxy. Un visitante recibe ErrorSoloLectura antes de que salga nada.
export async function requireEscritura(): Promise<UsuarioSesion> {
  const usuario = await requireSession();
  if (usuario.soloLectura) throw new ErrorSoloLectura();
  return usuario;
}
