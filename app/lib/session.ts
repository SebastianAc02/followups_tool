import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from './auth';
import { usuarioDeSesion, type UsuarioSesion } from './session-user';
import { organizacionDeUsuario } from '../db/organizacion-repository';
import { marcarSoloLectura, ErrorSoloLectura } from './read-only';
import { reservarModo } from './modo-prueba';
import { leerCookieModoPrueba } from './cookie-modo';
import { reservarOffset } from './reloj';
import { leerCookieOffsetDemo } from './cookie-reloj';
import { resolverMembresia } from './resolucion-sesion';

// Gate de sesion (V2.2): toda pagina y todo server action lo llaman primero.
// Sin sesion valida no se ve ni se escribe nada.
export async function requireSession(): Promise<UsuarioSesion> {
  // ESTAS DOS LINEAS VAN ANTES DEL PRIMER await Y EL ORDEN NO ES COSMETICO.
  //
  // El cuerpo de una funcion async corre en el contexto del LLAMADOR solo hasta su primer
  // await; despues vive en un contexto hijo que muere al retornar. Reservar aca es lo que
  // hace que la page/action que nos awaitea comparta las cajas y vea lo que escribimos mas
  // abajo. Mover esto debajo de cualquier await revive el bug del 2026-07-15: el banner
  // decia MODO PRUEBA y las queries salian contra isps.db (ver modo-prueba.ts para el
  // mecanismo completo, y modo-prueba-await.test.ts para la reproduccion).
  const cajaModo = reservarModo();
  const cajaOffset = reservarOffset();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  // El modo se resuelve ANTES del primer acceso a `db` conmutable. getSession (arriba) y
  // organizacionDeUsuario (abajo) leen dbReal fijo, asi que no dependen de esto -- pero
  // cualquier query de negocio de esta request si.
  cajaModo.valor = await leerCookieModoPrueba();

  // El offset del reloj de demo viaja junto al modo: hoy() en las paginas RSC lo lee.
  // offsetActual() consulta esModoPrueba() (el offset solo aplica en prueba), asi que la
  // caja del modo ya tiene que estar llena. En una request normal la cookie no existe y el
  // offset queda en 0.
  cajaOffset.dias = await leerCookieOffsetDemo();

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
