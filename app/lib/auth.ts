import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { dbReal } from '../db/index';

// Adaptador de auth (B3). El core no importa este archivo: la identidad entra a la app
// solo como datos planos (email, owner, admin) via app/lib/session.ts.
export const auth = betterAuth({
  // dbReal y no db: tu sesion es la misma en modo prueba y en modo real. Si auth
  // conmutara, activar el modo prueba buscaria tu sesion en pruebas.db (donde no existe)
  // y te sacaria a /login, y loguearte ahi crearia una cuenta duplicada.
  database: drizzleAdapter(dbReal, { provider: 'sqlite' }),
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
