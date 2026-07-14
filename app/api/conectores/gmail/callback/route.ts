import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '../../../../lib/session';
import { intercambiarCodigoPorCredencial, mandarCorreoDePrueba } from '../../../../adapters/gmail';
import { guardarCredencialConector, registrarHeartbeatConector } from '../../../../db/repository';

const COOKIE_STATE = 'gmail_oauth_state';

// Callback OAuth (Etapa 1, pasos 2-4 del design doc): intercambia code -> credencial, la
// guarda TENTATIVA (estado activo, ultimoResultado todavia null = "Configurado" en
// vistaEstado, no "Vivo" -- ver app/conectores/estado-ui.ts), manda el correo de prueba, y
// deja que /conectores muestre "revisa tu bandeja" -- solo confirmarVerificacionGmailAction
// (gmail-actions.ts) marca 'ok'.
export async function GET(req: NextRequest) {
  const sesion = await requireSession();
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const stateCookie = req.cookies.get(COOKIE_STATE)?.value;

  if (!code || !state || !stateCookie || state !== stateCookie) {
    return NextResponse.redirect(new URL('/conectores?gmailError=state', req.url));
  }

  try {
    const credencial = await intercambiarCodigoPorCredencial(code);
    guardarCredencialConector('gmail', JSON.stringify(credencial), sesion.id);

    try {
      await mandarCorreoDePrueba(sesion.id, credencial.emailCuenta);
    } catch (e) {
      // La credencial SI quedo guardada (Google la emitio), pero la prueba de envio fallo --
      // se registra como error (no como "pendiente de confirmar"), para que la UI muestre
      // "Caido" en vez de pedir confirmar un correo que nunca salio. Alerta real al admin
      // queda pendiente de app/lib/alerta-admin.ts (spec 2026-07-14-conectores-apollo-
      // granola-design.md, todavia no construido) -- no se duplica aca, ver nota del design
      // doc de este spec, paso 4 de la Etapa 1.
      const mensaje = e instanceof Error ? e.message : String(e);
      registrarHeartbeatConector('gmail', `error: ${mensaje}`, sesion.id);
      return NextResponse.redirect(new URL('/conectores?gmailError=prueba', req.url));
    }

    const res = NextResponse.redirect(new URL('/conectores', req.url));
    res.cookies.delete(COOKIE_STATE);
    return res;
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error(`Gmail OAuth callback fallo: ${mensaje}`);
    return NextResponse.redirect(new URL('/conectores?gmailError=oauth', req.url));
  }
}
