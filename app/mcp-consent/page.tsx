import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '../lib/auth';
import { clienteOauthPorId } from '../db/organizacion-repository';
import { aprobarConsentimientoMcpAction, rechazarConsentimientoMcpAction } from './actions';

// Pantalla de consentimiento OAuth del MCP (review de seguridad 2026-07-23,
// docs/superpowers/specs/2026-07-23-mcp-oauth-login-design.md): app/lib/mcp-forzar-consentimiento.ts
// obliga a que TODA autorizacion pase por aca (prompt=consent forzado, sin excepcion). El
// plugin `mcp` de Better Auth redirige aca con `?consent_code=...&client_id=...&scope=...`
// (node_modules/better-auth/dist/plugins/mcp/authorize.mjs) despues de que el usuario ya
// esta logueado -- por eso el chequeo de sesion aca es defensivo (mismo patron que
// /reclamar), no la barrera principal.
//
// Aprobar/Rechazar llaman a auth.api.oAuthConsent (app/mcp-consent/actions.ts) -- ningun
// code se emite sin que esta pantalla la apruebe explicitamente.
export default async function McpConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ consent_code?: string; client_id?: string; scope?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const sp = await searchParams;
  const consentCode = sp.consent_code ?? '';
  const clientId = sp.client_id ?? '';
  const scope = sp.scope ?? '';

  // Sin consent_code no hay nada que aprobar/rechazar (link mal formado o ya usado) --
  // manda al home en vez de mostrar botones que solo tirarian error al hacer submit.
  if (!consentCode) redirect('/');

  const cliente = clientId ? clienteOauthPorId(clientId) : undefined;
  const scopes = scope.split(' ').filter(Boolean);

  return (
    <div className="auth-cockpit">
      <div className="ac-card">
        <div className="ac-inner">
          <div className="ac-brand">
            <div className="ac-brand-mark">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="8" stroke="#0b0d10" strokeWidth="2" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="#0b0d10" strokeWidth="2" />
                <circle cx="12" cy="12" r="2" fill="#0b0d10" />
              </svg>
            </div>
            <span className="ac-brand-name">OnePay Cockpit</span>
          </div>

          <h2 className="ac-h big">Autorizar acceso</h2>
          <p className="ac-sub">
            <strong>{cliente?.name ?? clientId ?? 'Una aplicación'}</strong> quiere conectarse a tu cuenta de
            Onepay y consultar el pipeline en modo lectura.
          </p>

          {scopes.length > 0 && (
            <ul className="ac-consent-scopes">
              {scopes.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}

          <p className="ac-sub">
            Si no reconoces esta aplicación o no la solicitaste tú, rechaza: ningún dato se comparte hasta que
            apruebes.
          </p>

          <form action={aprobarConsentimientoMcpAction.bind(null, consentCode)}>
            <button type="submit" className="ac-btn">
              Aprobar
            </button>
          </form>
          <form action={rechazarConsentimientoMcpAction.bind(null, consentCode)}>
            <button type="submit" className="ac-btn ac-btn-secondary">
              Rechazar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
