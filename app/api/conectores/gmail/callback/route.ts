import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '../../../../lib/session';
import { intercambiarCodigoPorCredencial, mandarCorreoDePrueba } from '../../../../adapters/gmail';
import { guardarCredencialConector, registrarHeartbeatConector } from '../../../../db/repository';
import { avisarAdminPorWhatsapp } from '../../../../lib/alerta-admin';

const COOKIE_STATE = 'gmail_oauth_state';

// Callback OAuth (Etapa 1, pasos 2-4 del design doc): intercambia code -> credencial, la
// guarda TENTATIVA y deja que /conectores muestre "revisa tu bandeja" -- solo
// confirmarVerificacionGmailAction (gmail-actions.ts) marca 'ok'.
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
    // guardarCredencialConector NO resetea ultimoResultado en un update -- sin esto, RE-
    // conectar una cuenta que ya estaba verificada ('ok' de una conexion anterior) dejaria
    // la credencial NUEVA marcada "Vivo" sin que el usuario la confirme nunca, violando el
    // "verificar antes de Configurado" no-negociable del design doc. 'pendiente_confirmacion'
    // no es 'ok' ni empieza con 'error', asi que vistaEstado (estado-ui.ts) la muestra como
    // "Configurado" (pendiente), igual que la primera vez que se conecta.
    registrarHeartbeatConector('gmail', 'pendiente_confirmacion', sesion.id);

    try {
      await mandarCorreoDePrueba(sesion.id, credencial.emailCuenta);
    } catch (e) {
      // La credencial SI quedo guardada (Google la emitio), pero la prueba de envio fallo --
      // se registra como error (no como "pendiente de confirmar"), para que la UI muestre
      // "Caido" en vez de pedir confirmar un correo que nunca salio. Alerta real al admin via
      // avisarAdminPorWhatsapp (app/lib/alerta-admin.ts, ya construido) -- mismo patron que
      // verificarGranolaAction usa para el error analogo de Granola (app/conectores/actions.ts).
      const mensaje = e instanceof Error ? e.message : String(e);
      registrarHeartbeatConector('gmail', `error: ${mensaje}`, sesion.id);
      await avisarAdminPorWhatsapp(`${sesion.owner} conectó Gmail pero el correo de verificación falló: ${mensaje}`);
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
