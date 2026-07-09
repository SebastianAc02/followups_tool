// Pixel de apertura (sesion 2026-07-09): Apollo sustituye {{email}} por el correo real
// del destinatario antes de mandar (ver app/core/tracking-links.ts para el porque de
// este diseño); esta ruta correlaciona por (proveedorCampanaId, email) -- MISMO
// correlator que ya usa el poll de replies (resolverDestinatarioPorEmail, V5.5), no uno
// nuevo. El pixel SIEMPRE se devuelve, pase lo que pase con la correlacion: una imagen
// rota en un correo real es peor que perder un evento de tracking.
import { NextRequest, NextResponse } from 'next/server';
import { resolverDestinatarioPorEmail, guardarEventoTracking } from '../../../db/repository';

const PIXEL_1X1_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

export async function GET(req: NextRequest) {
  const proveedorCampanaId = req.nextUrl.searchParams.get('c');
  const email = req.nextUrl.searchParams.get('e');

  // email === '{{email}}' literal significa que Apollo NO sustituyo el merge-tag (la
  // suposicion sin verificar de tracking-links.ts resulto falsa) -- no hay con que
  // correlacionar, se ignora en vez de guardar un evento inservible.
  if (proveedorCampanaId && email && email !== '{{email}}') {
    try {
      const destinatario = resolverDestinatarioPorEmail(proveedorCampanaId, email);
      if (destinatario) {
        guardarEventoTracking(destinatario.idPasoInscripcion, {
          proveedorEventoId: `pixel:${destinatario.idPasoInscripcion}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
          tipo: 'abierto',
          canal: 'correo',
          fechaEvento: new Date().toISOString(),
          email,
          detalle: { via: 'pixel' },
        });
      }
    } catch {
      // nunca romper la entrega del pixel por un error de correlacion/DB
    }
  }

  return new NextResponse(PIXEL_1X1_GIF, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    },
  });
}
