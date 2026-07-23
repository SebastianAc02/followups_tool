'use server';

// Server actions de la pantalla de consentimiento del MCP (review de seguridad 2026-07-23,
// ver app/lib/mcp-forzar-consentimiento.ts para el por que existe esta pantalla). Llaman al
// endpoint REAL del plugin (`auth.api.oAuthConsent`, POST /api/auth/oauth2/consent en HTTP,
// aca invocado directo server-side igual que auth.api.getSession en el resto del repo) --
// no se reimplementa la logica de aprobar/emitir code, solo se pasa `accept` y
// `consent_code`.
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '../lib/auth';

export async function aprobarConsentimientoMcpAction(consentCode: string): Promise<void> {
  const resultado = await auth.api.oAuthConsent({
    body: { accept: true, consent_code: consentCode },
    headers: await headers(),
  });
  // redirectURI es el redirect_uri del CLIENTE (Claude, o el de un cliente cualquiera si el
  // usuario decidio aprobar) con el ?code= ya puesto -- puede ser cross-origin a proposito,
  // redirect() de next/navigation soporta URLs absolutas ademas de rutas internas.
  redirect(resultado.redirectURI);
}

export async function rechazarConsentimientoMcpAction(consentCode: string): Promise<void> {
  const resultado = await auth.api.oAuthConsent({
    body: { accept: false, consent_code: consentCode },
    headers: await headers(),
  });
  // Con accept:false el plugin devuelve el redirect_uri del cliente con
  // ?error=access_denied -- ningun code sale nunca. Esa es la defensa (spec del review:
  // "que un usuario pueda RECHAZAR").
  redirect(resultado.redirectURI);
}
