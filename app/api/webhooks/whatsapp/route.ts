// Tarea 5 (plan-whatsapp-adapter.md, D5): webhook de entrada de Evolution. El route NO
// decide NADA de dominio -- autentica, parsea el payload VIA el adaptador
// (parsearMensajeEntrante vive en evolution.ts, no aca), cablea las deps del repository y
// delega al core (procesarRespuestaEntrante). Mismo estilo de cableado que worker/index.ts.
// Request/Response estandar en vez de NextRequest/NextResponse (2026-07-26): este endpoint
// no usa nada propio de Next (ni cookies, ni redirects, ni rewrites), y con next/server el
// archivo no se puede importar desde el test runner del repo, asi que el webhook llevaba sin
// una sola prueba propia desde que existe. Mismo camino que ya tomo app/api/mcp/route.ts.
import {
  candidatosContactoConTelefono,
  guardarMensajeEntrante,
  guardarMensajeSaliente,
  inscripcionesActivasDeEmpresa,
  pausarInscripcion,
  registrarToqueEntrante,
  registrarRespuestaDetectada,
  guardarVistoWhatsapp,
} from '../../../db/repository';
import { crearRegistroEnvio } from '../../../adapters/registro-envio';
import { parsearMensajeEntrante, parsearMensajeSaliente, parsearAcuseLectura } from '../../../adapters/evolution';
import { esLineaDePruebas } from '../../../db/ruteo-linea';
import { reservarModo } from '../../../lib/modo-prueba';
import {
  procesarRespuestaEntrante,
  resolverPorUltimos10,
  type RespuestaEntranteDeps,
} from '../../../core/llego-respuesta';

export async function POST(req: Request) {
  // VA ANTES DEL PRIMER await, igual que en requireSession (ver modo-prueba.ts): el cuerpo
  // de una funcion async corre en el contexto del llamador solo hasta su primer await, y
  // reservar despues marcaria un contexto que nadie lee. La caja se llena mas abajo, cuando
  // el payload ya nos dijo de que linea viene.
  const cajaModo = reservarModo();

  // Auth: token secreto en la URL (?token=...). Fijar WHATSAPP_WEBHOOK_TOKEN y ponerlo en
  // la URL del webhook de Evolution. Si esta seteado se EXIGE; si no (dev local) se procesa
  // igual. OJO Fase 1 (VPS): antes de exponer este endpoint el token es obligatorio.
  const esperado = process.env.WHATSAPP_WEBHOOK_TOKEN;
  if (esperado && new URL(req.url).searchParams.get('token') !== esperado) {
    return Response.json({ ok: false, error: 'token invalido' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: true, ignorado: 'body no-json' }, { status: 200 });
  }

  // Acuse de lectura (visto): se resuelve antes del parseo de respuesta entrante --
  // 'messages.update' nunca pasa el filtro de parsearMensajeEntrante (solo mira
  // 'messages.upsert'), asi que no hay conflicto entre los dos caminos.
  const acuse = parsearAcuseLectura(body);
  if (acuse) {
    cajaModo.valor = esLineaDePruebas(acuse.referenciaProveedor);
    guardarVistoWhatsapp(acuse.proveedorMensajeId);
    return Response.json({ ok: true, visto: true }, { status: 200 });
  }

  // Parseo en el adaptador: null = no es una respuesta entrante que nos interese (otro
  // evento, algo que mandamos nosotros, o un mensaje sin texto). Ack limpio, nada que hacer.
  const mensaje = parsearMensajeEntrante(body);
  if (!mensaje) {
    // Lo que SALE por la linea (2026-07-26). Va DESPUES del entrante y no antes, para que el
    // camino que corta cadencias siga siendo el primero que se evalua: un cambio aca no puede
    // retrasar ni desviar la respuesta de un ISP, que es lo unico urgente de este endpoint.
    // Los dos parsers son excluyentes por key.fromMe, asi que ningun payload cae en ambos.
    const saliente = parsearMensajeSaliente(body);
    if (saliente) {
      cajaModo.valor = esLineaDePruebas(saliente.referenciaProveedor);
      try {
        // FILTRO DE PRIVACIDAD, y es la razon de ser de esta rama tal como esta escrita. La
        // linea del operador es personal y de trabajo a la vez: guardar todo lo que sale
        // meteria sus conversaciones privadas en una base comercial. Se guarda SOLO si el
        // destinatario es un contacto de una empresa de la base; lo demas se descarta aca
        // mismo, antes de tocar el repository.
        //
        // El match es por los ultimos 10 digitos, el mismo criterio que ya usa el entrante,
        // para que las dos direcciones decidan con la misma regla y no una mas laxa que la
        // otra.
        const match = resolverPorUltimos10(candidatosContactoConTelefono(), saliente.telefono);
        if (!match) {
          // Ni el texto ni el numero salen por el log. Un descarte por privacidad que deja el
          // contenido en los logs del server no descarto nada: solo lo movio de la base a otro
          // archivo que tambien se lee. El contador va sin dato para poder ver que el filtro
          // esta vivo sin ver a quien filtro.
          return Response.json({ ok: true, ignorado: 'saliente sin cuenta' }, { status: 200 });
        }
        guardarMensajeSaliente(saliente, match.idContacto);
      } catch (e) {
        // Mismo criterio que el entrante: nunca 5xx. Evolution reintenta ante un 5xx y un
        // error de logica no se arregla reintentando; ademas un fallo guardando el saliente no
        // puede hacer que Evolution reintente el payload y con el vuelva a procesarse otra cosa.
        // Se loguea el error, NUNCA el mensaje: `e` de guardarMensajeSaliente no lo contiene.
        console.error('[webhook/whatsapp] error guardando mensaje saliente:', e);
      }
      return Response.json({ ok: true, saliente: true }, { status: 200 });
    }
    return Response.json({ ok: true, ignorado: true }, { status: 200 });
  }

  // La linea del payload decide la base, y va ANTES de tocar el repository: de aca en
  // adelante todo (guardarMensajeEntrante, pausarInscripcion, el toque) cae donde vive esa
  // linea. Sin esto, un reply a una linea de prueba se guardaba en isps.db y la UI en modo
  // prueba nunca lo encontraba.
  cajaModo.valor = esLineaDePruebas(mensaje.referenciaProveedor);

  try {
    // El adaptador de correo (Apollo) es el TrackingPoll que corta la secuencia externa
    // (sacarDestinatario, decision B). crearRegistroEnvio().correo nunca es null hoy (Apollo
    // siempre registrado), pero el tipo lo permite -- se valida antes de delegar.
    const correo = crearRegistroEnvio().correo;
    if (!correo) throw new Error('no hay adaptador de correo (Apollo) para cortar la secuencia');

    const deps: RespuestaEntranteDeps = {
      registrarEntrante: (m, match) => guardarMensajeEntrante(m, match ? match.idContacto : null),
      matchearContacto: (telefono) => resolverPorUltimos10(candidatosContactoConTelefono(), telefono),
      inscripcionesActivas: inscripcionesActivasDeEmpresa,
      pausarInscripcion,
      registrarToqueEntrante,
      registrarRespuestaDetectada,
    };
    await procesarRespuestaEntrante(deps, correo, mensaje);
  } catch (e) {
    // No devolvemos 5xx: Evolution reintenta ante un 5xx y un error de logica no se arregla
    // reintentando (solo generaria ruido). El mensaje queda registrado idempotente por
    // mensaje_whatsapp.mensaje_id. Se loguea para verlo en los logs del server.
    console.error('[webhook/whatsapp] error procesando respuesta entrante:', e);
  }

  return Response.json({ ok: true }, { status: 200 });
}
