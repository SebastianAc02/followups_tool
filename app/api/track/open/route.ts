// Pixel de apertura (sesion 2026-07-09): Apollo sustituye {{email}} por el correo real
// del destinatario antes de mandar (ver app/core/tracking-links.ts para el porque de
// este diseño); esta ruta correlaciona por (proveedorCampanaId, email) -- MISMO
// correlator que ya usa el poll de replies (resolverDestinatarioPorEmail, V5.5), no uno
// nuevo. El pixel SIEMPRE se devuelve, pase lo que pase con la correlacion: una imagen
// rota en un correo real es peor que perder un evento de tracking.
//
// Request/Response estandar en vez de NextRequest/NextResponse (2026-08-03): esta ruta no
// usa nada propio de Next (ni cookies, ni rewrites), y con next/server el archivo no se
// puede importar desde el test runner del repo, asi que el pixel llevaba sin una sola prueba
// propia desde que existe -- justo el endpoint donde un evento se perdia en silencio. Mismo
// camino que ya tomaron app/api/mcp/route.ts y el webhook de Evolution, por la misma razon.
import { resolverDestinatarioPorEmail, guardarEventoTracking } from '../../../db/repository';
import { huellaRequest } from '../huella-request';
import { reservarModo } from '../../../lib/modo-prueba';
import { esCampanaDePruebas } from '../../../db/ruteo-campana';

const PIXEL_1X1_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

function pixel(): Response {
  return new Response(PIXEL_1X1_GIF, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    },
  });
}

export async function GET(req: Request) {
  // VA ANTES DEL PRIMER await, igual que en requireSession y en el webhook de Evolution (ver
  // app/lib/modo-prueba.ts): el cuerpo de una funcion async corre en el contexto del llamador
  // solo hasta su primer await, y reservar despues marcaria un contexto que nadie lee. La caja
  // se llena mas abajo, cuando el query string ya nos dijo de que campana viene.
  const cajaModo = reservarModo();

  const params = new URL(req.url).searchParams;
  const proveedorCampanaId = params.get('c');
  const email = params.get('e');

  // email === '{{email}}' literal significa que Apollo NO sustituyo el merge-tag (la
  // suposicion sin verificar de tracking-links.ts resulto falsa) -- no hay con que
  // correlacionar, se ignora en vez de guardar un evento inservible.
  if (!proveedorCampanaId || !email || email === '{{email}}') {
    console.warn(
      `[track:open] evento descartado: query incompleto (c=${proveedorCampanaId ?? 'ausente'}, e=${email ?? 'ausente'})`,
    );
    return pixel();
  }

  // La campana decide la base, y va ANTES de tocar el repository: de aca en adelante todo
  // (resolver el destinatario, guardar el evento) cae donde vive esa campana. Sin esto, la
  // apertura de un correo mandado en modo prueba se buscaba en isps.db, no encontraba a nadie
  // y se tiraba -- por eso pruebas.db tenia CERO aperturas reales. Ver db/ruteo-campana.ts.
  cajaModo.valor = esCampanaDePruebas(proveedorCampanaId);

  try {
    const destinatario = resolverDestinatarioPorEmail(proveedorCampanaId, email);
    if (!destinatario) {
      // ESTE LOG ES EL PUNTO DEL COMMIT, no un extra. Antes esta rama era un `if` sin else
      // dentro de un `catch {}` mudo: el evento desaparecia sin dejar rastro, y eso es lo que
      // dejo al modo prueba tres semanas midiendo cero sin que nadie sospechara. Un descarte
      // silencioso es indistinguible de "nadie abrio el correo", que es la lectura mas cara
      // posible: el operador decide el siguiente toque creyendo que no lo vieron.
      console.warn(
        `[track:open] evento descartado: sin destinatario para (campana ${proveedorCampanaId}, ${email}) en la base ${
          cajaModo.valor ? 'de pruebas' : 'real'
        }`,
      );
      return pixel();
    }

    guardarEventoTracking(destinatario.idPasoInscripcion, {
      proveedorEventoId: `pixel:${destinatario.idPasoInscripcion}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      tipo: 'abierto',
      canal: 'correo',
      fechaEvento: new Date().toISOString(),
      email,
      // ua/ip se agregan al detalle en vez de columnas propias: `detalle` ya es JSON
      // libre, no hay migración que correr y nada que lea eventos viejos se rompe
      // (los de Apollo traen su payload entero ahí mismo). Ver huella-request.ts.
      detalle: { via: 'pixel', ...huellaRequest(req.headers) },
    });
  } catch (e) {
    // Nunca romper la entrega del pixel por un error de correlacion/DB. Pero SI dejar el
    // error escrito: tragarselo entero es el modo de falla que este archivo acaba de pagar.
    console.error(`[track:open] error guardando la apertura de (campana ${proveedorCampanaId}, ${email}):`, e);
  }

  return pixel();
}
