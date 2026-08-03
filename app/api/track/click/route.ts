// Redirect de tracking de clics (sesion 2026-07-09): mismo correlator y misma logica de
// "nunca romper la entrega" que /api/track/open (ver ese archivo y app/core/tracking-links.ts).
// Diferencia real: esto SI necesita responder algo usable si la url de destino viene
// invalida/ausente (no hay pixel de respaldo que devolver), y valida que la url sea
// http(s) antes de redirigir -- esta ruta es publica (cualquiera puede pegarle un GET),
// no se vuelve un open-redirect generico para cualquier esquema.
//
// Request/Response estandar en vez de NextRequest/NextResponse (2026-08-03): misma razon que
// el pixel, ver el comentario de cabecera de ../open/route.ts. El redirect se arma a mano con
// un 302 + Location en vez de Response.redirect() porque este endpoint acepta una url de
// destino ya validada por urlSegura y no necesita la normalizacion que hace el helper.
import { resolverDestinatarioPorEmail, guardarEventoTracking } from '../../../db/repository';
import { huellaRequest } from '../huella-request';
import { reservarModo } from '../../../lib/modo-prueba';
import { esCampanaDePruebas } from '../../../db/ruteo-campana';

function urlSegura(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  // ANTES DEL PRIMER await, igual que el pixel y el webhook de Evolution. Ver
  // app/lib/modo-prueba.ts.
  const cajaModo = reservarModo();

  const params = new URL(req.url).searchParams;
  const proveedorCampanaId = params.get('c');
  const email = params.get('e');
  const destino = urlSegura(params.get('u'));

  if (!destino) {
    return Response.json({ error: 'url de destino invalida o ausente' }, { status: 400 });
  }

  const redirigir = () => new Response(null, { status: 302, headers: { Location: destino } });

  if (!proveedorCampanaId || !email || email === '{{email}}') {
    console.warn(
      `[track:click] evento descartado: query incompleto (c=${proveedorCampanaId ?? 'ausente'}, e=${email ?? 'ausente'})`,
    );
    return redirigir();
  }

  // La campana decide la base, igual que en el pixel. Ver db/ruteo-campana.ts para la regla
  // asimetrica (si el id esta en las dos bases, gana la real).
  cajaModo.valor = esCampanaDePruebas(proveedorCampanaId);

  try {
    const destinatario = resolverDestinatarioPorEmail(proveedorCampanaId, email);
    if (!destinatario) {
      // Mismo log explicito que el pixel, y por la misma razon: un clic descartado en silencio
      // es peor aca que alla. El clic es la unica señal que prueba lectura humana cuando el
      // pixel viene bloqueado (ver estadoMedibilidadEnvio en core/clasificar-evento-tracking.ts);
      // perderlo sin rastro degrada la medicion justo donde no hay respaldo.
      console.warn(
        `[track:click] evento descartado: sin destinatario para (campana ${proveedorCampanaId}, ${email}) en la base ${
          cajaModo.valor ? 'de pruebas' : 'real'
        }`,
      );
      return redirigir();
    }

    guardarEventoTracking(destinatario.idPasoInscripcion, {
      proveedorEventoId: `clic:${destinatario.idPasoInscripcion}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      tipo: 'clic',
      canal: 'correo',
      fechaEvento: new Date().toISOString(),
      email,
      // Misma huella que el pixel (ver huella-request.ts). El clic sirve para
      // correlacionar: si una apertura y un clic salen del mismo ua/ip, la apertura
      // fue de una persona; si la apertura viene de un ua de proxy y el clic de otro,
      // ahí está la prueba de que el conteo de aperturas está inflado.
      detalle: { url: destino, ...huellaRequest(req.headers) },
    });
  } catch (e) {
    // El redirect SIEMPRE ocurre, se haya podido registrar el evento o no. Pero el error
    // queda escrito: ver el mismo cambio en ../open/route.ts.
    console.error(`[track:click] error guardando el clic de (campana ${proveedorCampanaId}, ${email}):`, e);
  }

  return redirigir();
}
