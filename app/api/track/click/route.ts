// Redirect de tracking de clics (sesion 2026-07-09): mismo correlator y misma logica de
// "nunca romper la entrega" que /api/track/open (ver ese archivo y app/core/tracking-links.ts).
// Diferencia real: esto SI necesita responder algo usable si la url de destino viene
// invalida/ausente (no hay pixel de respaldo que devolver), y valida que la url sea
// http(s) antes de redirigir -- esta ruta es publica (cualquiera puede pegarle un GET),
// no se vuelve un open-redirect generico para cualquier esquema.
import { NextRequest, NextResponse } from 'next/server';
import { resolverDestinatarioPorEmail, guardarEventoTracking } from '../../../db/repository';

function urlSegura(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const proveedorCampanaId = req.nextUrl.searchParams.get('c');
  const email = req.nextUrl.searchParams.get('e');
  const destino = urlSegura(req.nextUrl.searchParams.get('u'));

  if (!destino) {
    return NextResponse.json({ error: 'url de destino invalida o ausente' }, { status: 400 });
  }

  if (proveedorCampanaId && email && email !== '{{email}}') {
    try {
      const destinatario = resolverDestinatarioPorEmail(proveedorCampanaId, email);
      if (destinatario) {
        guardarEventoTracking(destinatario.idPasoInscripcion, {
          proveedorEventoId: `clic:${destinatario.idPasoInscripcion}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
          tipo: 'clic',
          canal: 'correo',
          fechaEvento: new Date().toISOString(),
          email,
          detalle: { url: destino },
        });
      }
    } catch {
      // el redirect SIEMPRE ocurre, se haya podido registrar el evento o no
    }
  }

  return NextResponse.redirect(destino, 302);
}
