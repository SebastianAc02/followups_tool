import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { requireSession } from '../../../../lib/session';
import { construirUrlConsentimientoGmail } from '../../../../adapters/gmail';

const COOKIE_STATE = 'gmail_oauth_state';

// Arranca el flujo OAuth (Etapa 1, paso 1 del design doc): state random en cookie httpOnly
// de corta vida, verificado de vuelta en el callback (CSRF). requireSession primero: sin
// sesion valida no hay a que usuario conectarle el Gmail.
export async function GET() {
  await requireSession();
  const state = randomBytes(16).toString('hex');
  const res = NextResponse.redirect(construirUrlConsentimientoGmail(state));
  res.cookies.set(COOKIE_STATE, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/api/conectores/gmail',
  });
  return res;
}
