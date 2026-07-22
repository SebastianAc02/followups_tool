import Database from 'better-sqlite3';
import { auth } from '../app/lib/auth.ts';

const DB_PATH =
  process.env.ISPS_DB_PATH ??
  '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db';

// owner = valor EXACTO de empresa.owner en isps.db (B1.c en plan-claude-v2.md).
// verTodoPipeline (Fase 3, docs/plan-produccion-cro-campana.md): solo Camilo (el CRO) lo
// tiene en 1. Deliberadamente NO es admin=1 -- admin es panel/conectores de equipo, y
// Camilo no necesita eso para ver el pipeline, solo lectura ampliada.
const USUARIOS = [
  {
    email: process.env.SEED_EMAIL_SEBASTIAN ?? 'sacostamolin@gmail.com',
    nombre: 'Sebastián Acosta',
    owner: 'Sebastian Acosta Molina',
    admin: 1,
    verTodoPipeline: 0,
    passwordEnv: 'SEED_PASSWORD_SEBASTIAN',
  },
  {
    email: process.env.SEED_EMAIL_FELIPE ?? '',
    nombre: 'Felipe Castro',
    owner: 'Felipe Castro',
    admin: 0,
    verTodoPipeline: 0,
    passwordEnv: 'SEED_PASSWORD_FELIPE',
  },
  {
    email: process.env.SEED_EMAIL_CAMILO ?? '',
    nombre: 'Camilo Fonseca',
    owner: 'Camilo fonseca',
    admin: 0,
    verTodoPipeline: 1,
    passwordEnv: 'SEED_PASSWORD_CAMILO',
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
      // owner, admin y ver_todo_pipeline son input:false: solo se setean aqui, nunca
      // desde el cliente.
      const r = db
        .prepare('UPDATE "user" SET "owner" = ?, "admin" = ?, "ver_todo_pipeline" = ? WHERE "email" = ?')
        .run(u.owner, u.admin, u.verTodoPipeline, u.email);
      console.log(`  owner/admin/verTodoPipeline seteados (${r.changes} fila)`);

      // Multi-organizacion (Parte 1): reclamar la fila de organizacion_miembro que le
      // corresponde a este owner_canonico, si todavia esta libre. Sin esto, un usuario
      // recien onboardeado se autentica bien pero requireSession() revienta en cada
      // pagina porque organizacionDeUsuario() no encuentra membresia. Idempotente: en
      // una segunda corrida, id_user IS NULL ya no matchea y quedan 0 filas (esperado).
      const filaUser = db.prepare('SELECT id FROM "user" WHERE email = ?').get(u.email) as
        | { id: string }
        | undefined;
      if (filaUser) {
        const rOrg = db
          .prepare('UPDATE organizacion_miembro SET id_user = ? WHERE owner_canonico = ? AND id_user IS NULL')
          .run(filaUser.id, u.owner);
        console.log(`  organizacion_miembro reclamada (${rOrg.changes} fila)`);
      }
    }
  } finally {
    db.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
