import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { mcp } from 'better-auth/plugins';
import { dbReal } from '../db/index';
import { forzarConsentimientoMcp } from './mcp-forzar-consentimiento';

// Adaptador de auth (B3). El core no importa este archivo: la identidad entra a la app
// solo como datos planos (email, owner, admin) via app/lib/session.ts.
// Origenes confiables (2026-07-16). Sin esto, Better Auth solo acepta el origen de
// BETTER_AUTH_URL y responde "Invalid origin" a cualquier otro -- y el cliente traduce ese
// rechazo a "Correo o password incorrectos", que manda a buscar el problema al lado
// equivocado (medido en vivo: la password estaba bien).
//
// Pasa siempre que se entra por un dominio distinto al de la variable: tunel de ngrok (que
// ademas cambia de URL en cada reinicio), la IP de la LAN, o localhost cuando la variable
// apunta al tunel. Se aceptan los tres a proposito: es un cockpit interno detras de login,
// no una app publica, y el costo de un origen de mas es cero comparado con perder media
// hora en un error que miente.
function origenesConfiables(): string[] {
  const origenes = ['http://localhost:3000', 'http://127.0.0.1:3000'];
  const base = process.env.BETTER_AUTH_URL ?? process.env.APP_BASE_URL;
  if (base) origenes.push(base);
  // Cualquier subdominio de ngrok: la URL cambia en cada arranque del tunel y tener que
  // reiniciar el server con la variable nueva es justo la friccion que rompe la demo.
  origenes.push('https://*.ngrok-free.app', 'https://*.ngrok.io', 'https://*.ngrok.app');
  return origenes;
}

export const auth = betterAuth({
  // dbReal y no db: tu sesion es la misma en modo prueba y en modo real. Si auth
  // conmutara, activar el modo prueba buscaria tu sesion en pruebas.db (donde no existe)
  // y te sacaria a /login, y loguearte ahi crearia una cuenta duplicada.
  database: drizzleAdapter(dbReal, { provider: 'sqlite' }),
  // Explicito y no dejado a inferir del request/env (2026-07-23, login OAuth del MCP):
  // getMCPProviderMetadata (plugin `mcp`, ver abajo) lee ctx.context.options.baseURL --
  // el campo LITERAL de esta config, no el baseURL resuelto en runtime -- para el
  // `issuer` del discovery OAuth. Sin esto seteado a mano, options.baseURL queda
  // undefined (el resto del stack SI cae de vuelta a BETTER_AUTH_URL vía getBaseURL, pero
  // esta funcion puntual no), el endpoint /.well-known/oauth-authorization-server tira
  // "invalid_issuer" y el discovery sale roto en produccion aunque todo lo demas ande bien.
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.APP_BASE_URL,
  trustedOrigins: origenesConfiables(),
  emailAndPassword: {
    enabled: true,
    // Reabierto (2026-07-14) con un diseno distinto al original: /register ya no deriva
    // la lista de owners de la DB (ownersDisponibles filtraba basura de datos y exponia
    // nombres reales a cualquier visitante anonimo). Ahora hay dos caminos explicitos en
    // registrarUsuarioAction: 'onepay' (lista cerrada de 4 nombres reales, casing exacto)
    // o 'visitante' (nombre freeform, cae en la organizacion "Visitantes" -- vacia, sin
    // acceso a ningun dato real de Onepay). La seguridad ya no depende de bloquear el
    // signup a nivel de auth, sino de que "Visitantes" nunca tenga empresas reales.
    disableSignUp: false,
  },
  user: {
    additionalFields: {
      // Valor EXACTO de empresa.owner en isps.db ("Sebastian Acosta Molina"). B3 decia
      // owner=email, pero la columna owner guarda nombres y la tabla maestra no se migra
      // (CLAUDE.md); el mapeo vive aqui (B1.c en plan-claude-v2.md). input:false: no se
      // setea desde el cliente, solo por el script de seed (V2.3).
      owner: { type: 'string', required: false, input: false },
      admin: { type: 'boolean', defaultValue: false, input: false },
      // CRO (Camilo, Fase 3 plan-produccion-cro-campana.md): ve TODO el pipeline en
      // lectura (Felipe + Sebastian), sin ganar `admin` (panel/conectores de equipo).
      // input:false: solo lo setea scripts/seed_auth_users.ts o un UPDATE a mano.
      verTodoPipeline: { type: 'boolean', defaultValue: false, input: false },
    },
  },
  // Login OAuth para el MCP del panel (2026-07-23,
  // docs/superpowers/specs/2026-07-23-mcp-oauth-login-design.md): Better Auth pasa a ser el
  // authorization server (discovery + dynamic client registration + authorize + token),
  // reusando /login como pantalla de login -- no se rueda OAuth a mano.
  //
  // requirePKCE + consentPage agregados tras un review de seguridad (2026-07-23, mismo dia):
  // sin esto, DCR abierto (cualquiera registra un cliente, el protocolo MCP lo exige) + code
  // issuance sin consentimiento = un atacante arma un link de phishing a /mcp/authorize con
  // su propio redirect_uri y, si la victima ya esta logueada, el code sale solo hacia ese
  // redirect_uri sin que la victima vea ni apruebe nada -- suplanta identidad ANTES de que
  // corra el gate de rol (app/lib/mcp-gate.ts). requirePKCE:true (default real del plugin es
  // `undefined` = sin exigir, pese a que el tipo OIDCOptions documenta @default true para el
  // oidcProvider generico -- el opts que arma `mcp()` para SU PROPIO /mcp/authorize no
  // hereda ese default, ver node_modules/better-auth/dist/plugins/mcp/index.mjs) cierra el
  // downgrade de PKCE. consentPage por si solo NO alcanza (el redirect a consentPage esta
  // gateado por `query.prompt === "consent"`, decision del CLIENTE que arma la URL, no del
  // servidor): forzarConsentimientoMcp (abajo, plugin aparte) fuerza prompt=consent SIEMPRE
  // via un hook `before` sobre /mcp/authorize, para que la decision de mostrar consentimiento
  // sea del servidor. Ver el comentario largo en app/lib/mcp-forzar-consentimiento.ts.
  plugins: [
    mcp({
      loginPage: '/login',
      oidcConfig: {
        // loginPage duplicado aca: MCPOptions.oidcConfig tipa como OIDCOptions completo, que
        // exige loginPage no-opcional, aunque en runtime mcp() SIEMPRE lo pisa con el de
        // arriba (`loginPage: options.loginPage` en node_modules/better-auth/dist/plugins/
        // mcp/index.mjs). Es solo para que el tipo compile, no una segunda fuente de verdad.
        loginPage: '/login',
        requirePKCE: true,
        consentPage: '/mcp-consent',
      },
    }),
    forzarConsentimientoMcp,
  ],
});
