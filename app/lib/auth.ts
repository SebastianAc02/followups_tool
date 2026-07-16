import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { dbReal } from '../db/index';

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
    },
  },
});
