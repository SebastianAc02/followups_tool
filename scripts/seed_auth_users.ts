import Database from 'better-sqlite3';
import { auth } from '../app/lib/auth.ts';

const DB_PATH =
  process.env.ISPS_DB_PATH ??
  '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db';

// owner = valor EXACTO de empresa.owner en isps.db (B1.c en plan-claude-v2.md).
const USUARIOS = [
  {
    email: process.env.SEED_EMAIL_SEBASTIAN ?? 'sacostamolin@gmail.com',
    nombre: 'Sebastián Acosta',
    owner: 'Sebastian Acosta Molina',
    admin: 1,
    passwordEnv: 'SEED_PASSWORD_SEBASTIAN',
  },
  {
    email: process.env.SEED_EMAIL_FELIPE ?? '',
    nombre: 'Felipe Castro',
    owner: 'Felipe Castro',
    admin: 0,
    passwordEnv: 'SEED_PASSWORD_FELIPE',
  },
];

async function main() {
  const db = new Database(DB_PATH);
  try {
    for (const u of USUARIOS) {
      const password = process.env[u.passwordEnv];
      if (!u.email || !password) {
        console.error(`Falta ${u.passwordEnv} o el email de ${u.nombre}. No se crea.`);
        continue;
      }
      try {
        await auth.api.signUpEmail({ body: { email: u.email, password, name: u.nombre } });
        console.log(`Creado: ${u.email}`);
      } catch (e) {
        console.log(`${u.email} ya existia o fallo el alta: ${(e as Error).message}`);
      }
      // owner y admin son input:false: solo se setean aqui, nunca desde el cliente.
      const r = db
        .prepare('UPDATE "user" SET "owner" = ?, "admin" = ? WHERE "email" = ?')
        .run(u.owner, u.admin, u.email);
      console.log(`  owner/admin seteados (${r.changes} fila)`);
    }
  } finally {
    db.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
