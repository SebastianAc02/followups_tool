// Tarea 5 (plan-whatsapp-adapter.md, D5): webhook de entrada de Evolution. El route NO
// decide NADA de dominio -- autentica, parsea el payload VIA el adaptador
// (parsearMensajeEntrante vive en evolution.ts, no aca), cablea las deps del repository y
// delega al core (procesarRespuestaEntrante). Mismo estilo de cableado que worker/index.ts.
import { NextRequest, NextResponse } from 'next/server';
import {
  candidatosContactoConTelefono,
  guardarMensajeEntrante,
  inscripcionesActivasDeEmpresa,
  pausarInscripcion,
  registrarToqueEntrante,
  registrarRespuestaDetectada,
  guardarVistoWhatsapp,
} from '../../../db/repository';
import { crearRegistroEnvio } from '../../../adapters/registro-envio';
import { parsearMensajeEntrante, parsearAcuseLectura } from '../../../adapters/evolution';
import {
  procesarRespuestaEntrante,
  resolverPorUltimos10,
  type RespuestaEntranteDeps,
} from '../../../core/llego-respuesta';

export async function POST(req: NextRequest) {
  // Auth: token secreto en la URL (?token=...). Fijar WHATSAPP_WEBHOOK_TOKEN y ponerlo en
  // la URL del webhook de Evolution. Si esta seteado se EXIGE; si no (dev local) se procesa
  // igual. OJO Fase 1 (VPS): antes de exponer este endpoint el token es obligatorio.
  const esperado = process.env.WHATSAPP_WEBHOOK_TOKEN;
  if (esperado && req.nextUrl.searchParams.get('token') !== esperado) {
    return NextResponse.json({ ok: false, error: 'token invalido' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true, ignorado: 'body no-json' }, { status: 200 });
  }

  // Acuse de lectura (visto): se resuelve antes del parseo de respuesta entrante --
  // 'messages.update' nunca pasa el filtro de parsearMensajeEntrante (solo mira
  // 'messages.upsert'), asi que no hay conflicto entre los dos caminos.
  //
  // LIMITACION CONOCIDA: este webhook no pasa por requireSession, asi que
  // guardarVistoWhatsapp escribe siempre en isps.db (la real), nunca en pruebas.db. En
  // modo prueba el "vio el WhatsApp" no se vera aca -- la señal confiable de la demo es
  // la apertura de correo (Task 6). Cerrarlo del todo exige que el webhook sepa a que
  // linea/base pertenece el mensaje, trabajo aparte.
  const acuse = parsearAcuseLectura(body);
  if (acuse) {
    guardarVistoWhatsapp(acuse.proveedorMensajeId);
    return NextResponse.json({ ok: true, visto: true }, { status: 200 });
  }

  // Parseo en el adaptador: null = no es una respuesta entrante que nos interese (otro
  // evento, algo que mandamos nosotros, o un mensaje sin texto). Ack limpio, nada que hacer.
  const mensaje = parsearMensajeEntrante(body);
  if (!mensaje) {
    return NextResponse.json({ ok: true, ignorado: true }, { status: 200 });
  }

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

  return NextResponse.json({ ok: true }, { status: 200 });
}
