// Cierra el hueco encontrado en el review de seguridad (2026-07-23) del login OAuth del
// MCP: el plugin `mcp` de Better Auth SOLO redirige a `consentPage` cuando la request a
// `/mcp/authorize` trae `prompt=consent` en el query -- lo decide el CLIENTE que arma la
// URL de autorizacion, no el servidor (node_modules/better-auth/dist/plugins/mcp/authorize.mjs:
// `if (query.prompt !== "consent") { /* emite el code y redirige, SIN pantalla */ }`).
// Configurar `oidcConfig.consentPage` (app/lib/auth.ts) no alcanza solo: un atacante que
// registra su propio cliente OAuth (DCR esta abierto por diseno del protocolo MCP) arma un
// link de phishing a `/mcp/authorize` SIN `prompt=consent`, y si la victima ya esta logueada
// (admin/Camilo con la sesion abierta) el code sale directo hacia el redirect_uri del
// atacante sin que la victima vea NUNCA una pantalla de "esta app quiere acceso" ni pueda
// rechazar.
//
// La comparacion en authorize.mjs es un `!==` estricto contra el string literal "consent"
// (no un chequeo de set/membership sobre "prompt" separado por espacios) -- por eso
// forzarQueryConsentimiento no mezcla con lo que haya mandado el cliente, lo REEMPLAZA
// entero. Cualquier merge (ej. "login consent") arriesga no calzar con el `!== "consent"`
// si un prompt residual sobrevive al hook `after` del plugin (que solo limpia el token
// "login", ver mcp/index.mjs) -- reemplazar es la unica forma de garantizar la igualdad
// estricta en TODOS los casos.
//
// Efecto: TODA autorizacion pasa por consentPage sin excepcion, sin importar que pida el
// cliente. La victima ve que cliente pide acceso y a que scope, y puede Rechazar -- esa
// pantalla (app/mcp-consent/page.tsx) es la defensa real, no un adorno.
import { createAuthMiddleware } from 'better-auth/api';
import type { BetterAuthPlugin } from 'better-auth';

// Pura y testeada sin better-auth (app/lib/mcp-forzar-consentimiento.test.ts): el mecanismo
// completo se reduce a esto, el resto del archivo es solo el enchufe (matcher + middleware).
export function forzarQueryConsentimiento(queryActual: Record<string, unknown> | undefined): Record<string, unknown> {
  return { ...queryActual, prompt: 'consent' };
}

export const forzarConsentimientoMcp: BetterAuthPlugin = {
  id: 'mcp-forzar-consentimiento',
  hooks: {
    before: [
      {
        // ctx.path es el path DECLARADO del endpoint ("/mcp/authorize"), sin el basePath
        // de better-auth -- mismo criterio que usan los hooks `before` de los plugins
        // phone-number/username instalados (interceptan paths que ni siquiera son suyos,
        // ej. "/sign-up/email"): los hooks se matchean por path global, no por plugin dueno
        // del endpoint.
        matcher: (context) => context.path === '/mcp/authorize',
        handler: createAuthMiddleware(async (ctx) => {
          // Mutar IN-PLACE, NO reasignar. better-auth copia el contexto entre capas
          // (createInternalContext / createMiddleware, cada una `{...context}`): un
          // `ctx.query = objetoNuevo` cambia solo la copia local del handler y se descarta,
          // dejando el hook como no-op (el consentimiento NO se forzaba y el vector de
          // phishing seguia abierto -- review de seguridad 2026-07-23, verificado ejecutando
          // el mecanismo real de better-auth). El objeto `query` ya existente SI se comparte
          // por referencia entre las copias, asi que Object.assign sobre el mismo objeto si
          // propaga hasta la logica de /mcp/authorize.
          if (ctx.query) {
            Object.assign(ctx.query as Record<string, unknown>, forzarQueryConsentimiento(ctx.query as Record<string, unknown>));
          }
        }),
      },
    ],
  },
};
