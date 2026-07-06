import { eq, and, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { db as dbSingleton } from './index';
import * as schema from './schema';
import * as authSchema from './auth-schema';

const { organizacionMiembro } = schema;
const { user } = authSchema;

type DbInstancia = typeof dbSingleton;

export function miembrosLibres(idOrganizacion: number, db: DbInstancia = dbSingleton) {
  return db
    .select({ id: organizacionMiembro.idMiembro, nombreDisplay: organizacionMiembro.nombreDisplay })
    .from(organizacionMiembro)
    .where(and(eq(organizacionMiembro.idOrganizacion, idOrganizacion), isNull(organizacionMiembro.idUser)))
    .all();
}

export function miembroLibrePorId(idMiembro: number, db: DbInstancia = dbSingleton) {
  return db
    .select()
    .from(organizacionMiembro)
    .where(and(eq(organizacionMiembro.idMiembro, idMiembro), isNull(organizacionMiembro.idUser)))
    .get();
}

// Reclamo atomico: solo tiene efecto si nadie mas reclamo el miembro entre que se leyo
// (miembroLibrePorId) y que se llama esto. Devuelve true si el reclamo tuvo efecto.
export function reclamarMiembro(idMiembro: number, idUsuario: string, db: DbInstancia = dbSingleton): boolean {
  const res = db
    .update(organizacionMiembro)
    .set({ idUser: idUsuario })
    .where(and(eq(organizacionMiembro.idMiembro, idMiembro), isNull(organizacionMiembro.idUser)))
    .run();
  return res.changes === 1;
}

// owner es input:false en Better Auth (app/lib/auth.ts): nunca se setea desde el cliente.
// Este UPDATE directo es la unica via para escribirlo en runtime, igual que ya hace
// scripts/seed_auth_users.ts a mano para el alta por script.
export function setOwnerDeUsuario(idUsuario: string, owner: string, db: DbInstancia = dbSingleton): void {
  db.update(user).set({ owner }).where(eq(user.id, idUsuario)).run();
}

// Helper solo para tests: crea una instancia Drizzle apuntando a un archivo de prueba, con
// el MISMO shape de schema que el singleton real (schema + authSchema) para que el tipo
// DbInstancia calce sin castear.
export function dbDePrueba(dbPath: string) {
  const sqlite = new Database(dbPath);
  return drizzle(sqlite, { schema: { ...schema, ...authSchema } });
}
