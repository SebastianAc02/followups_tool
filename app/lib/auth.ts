import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db/index';

// Adaptador de auth (B3). El core no importa este archivo: la identidad entra a la app
// solo como datos planos (email, owner, admin) via app/lib/session.ts.
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'sqlite' }),
  emailAndPassword: {
    enabled: true,
    // Alta de usuarios solo por script (V2.3). Sin ALLOW_SIGNUP=1 nadie se registra solo.
    disableSignUp: process.env.ALLOW_SIGNUP !== '1',
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
