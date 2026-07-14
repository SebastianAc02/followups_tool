import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db/index';

// Adaptador de auth (B3). El core no importa este archivo: la identidad entra a la app
// solo como datos planos (email, owner, admin) via app/lib/session.ts.
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'sqlite' }),
  emailAndPassword: {
    enabled: true,
    // Cerrado (2026-07-14): /register no exigia dominio de correo, y el dropdown de
    // owners libres dejaba que cualquier visitante con cualquier email reclamara la
    // identidad de un vendedor real que todavia no se hubiera registrado (veria su
    // pipeline completo). Gate real aca, no solo en la UI: aunque alguien llame
    // registrarUsuarioAction directo, signUpEmail lo rechaza. Cuentas nuevas: a mano
    // (scripts/seed_auth_users.ts), como antes de V6.
    disableSignUp: true,
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
