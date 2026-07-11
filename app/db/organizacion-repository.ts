import { eq, and, isNull, isNotNull, notInArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { db as dbSingleton } from './index';
import * as schema from './schema';
import * as authSchema from './auth-schema';

const { organizacionMiembro, organizacion, empresa } = schema;
const { user } = authSchema;

type DbInstancia = typeof dbSingleton;

export function miembrosLibres(idOrganizacion: number, db: DbInstancia = dbSingleton) {
  return db
    .select({ id: organizacionMiembro.idMiembro, nombreDisplay: organizacionMiembro.nombreDisplay })
    .from(organizacionMiembro)
    .where(and(eq(organizacionMiembro.idOrganizacion, idOrganizacion), isNull(organizacionMiembro.idUser)))
    .all();
}

// Solo-lectura para /perfil (Fase 1 de la abstraccion de Perfil): el miembro de
// organizacion ya reclamado por este usuario, con el nombre de la organizacion.
// A diferencia de miembrosLibres/miembroLibrePorId (idUser IS NULL), aca se busca
// exactamente lo contrario: la membresia YA asignada a este idUser.
export function organizacionDeUsuario(idUser: string, db: DbInstancia = dbSingleton) {
  return db
    .select({
      idOrganizacion: organizacion.idOrganizacion,
      nombreOrganizacion: organizacion.nombre,
      nombreDisplay: organizacionMiembro.nombreDisplay,
      ownerCanonico: organizacionMiembro.ownerCanonico,
    })
    .from(organizacionMiembro)
    .innerJoin(organizacion, eq(organizacion.idOrganizacion, organizacionMiembro.idOrganizacion))
    .where(eq(organizacionMiembro.idUser, idUser))
    .get();
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

// Combina el reclamo del miembro y el seteo de owner en una sola transaccion: si algo
// truena entre las dos escrituras, ninguna queda a medias (sin esto, un miembro podia
// quedar reclamado con el owner del usuario todavia sin setear). Devuelve false si el
// reclamo no tuvo efecto (alguien mas gano la carrera); en ese caso no toca la tabla user.
export function reclamarMiembroYSetOwner(
  idMiembro: number,
  idUsuario: string,
  owner: string,
  db: DbInstancia = dbSingleton,
): boolean {
  return db.transaction((tx) => {
    const res = tx
      .update(organizacionMiembro)
      .set({ idUser: idUsuario })
      .where(and(eq(organizacionMiembro.idMiembro, idMiembro), isNull(organizacionMiembro.idUser)))
      .run();
    if (res.changes !== 1) return false;

    tx.update(user).set({ owner }).where(eq(user.id, idUsuario)).run();
    return true;
  });
}

// Registro libre (sin cupos pre-sembrados a mano): el select del formulario se llena con
// owners REALES de empresa.owner (nunca texto libre), asi que el match exacto que exige
// el filtro de la cola (repository.ts, eq(empresa.owner, owner)) queda garantizado por
// construccion. Devuelve solo los owners que ya tienen empresas asignadas en esta
// organizacion y que ningun usuario reclamo todavia.
export function ownersDisponibles(idOrganizacion: number, db: DbInstancia = dbSingleton): string[] {
  const yaReclamados = db
    .select({ owner: organizacionMiembro.ownerCanonico })
    .from(organizacionMiembro)
    .where(and(eq(organizacionMiembro.idOrganizacion, idOrganizacion), isNotNull(organizacionMiembro.idUser)))
    .all()
    .map((r) => r.owner);

  const filas = db
    .selectDistinct({ owner: empresa.owner })
    .from(empresa)
    .where(
      and(
        eq(empresa.organizacionActivaId, idOrganizacion),
        isNotNull(empresa.owner),
        yaReclamados.length > 0 ? notInArray(empresa.owner, yaReclamados) : undefined,
      ),
    )
    .all();

  return filas.map((r) => r.owner).filter((o): o is string => o !== null).sort();
}

// Crea el miembro YA reclamado (idUser puesto desde el INSERT) y setea owner, atomico.
// El chequeo de "nadie mas lo tomo todavia" va DENTRO de la misma transaccion sincrona
// (better-sqlite3 corre transacciones sync) en vez de confiar en que ownersDisponibles
// siga vigente entre el render del select y el submit: si dos personas eligen el mismo
// owner casi al tiempo, la segunda transaccion ve el insert de la primera y aborta.
// Devuelve false si el owner ya fue reclamado (no toca la tabla user en ese caso).
export function crearMiembroYSetOwner(
  idOrganizacion: number,
  ownerCanonico: string,
  nombreDisplay: string,
  idUsuario: string,
  db: DbInstancia = dbSingleton,
): boolean {
  return db.transaction((tx) => {
    const yaTomado = tx
      .select({ id: organizacionMiembro.idMiembro })
      .from(organizacionMiembro)
      .where(and(eq(organizacionMiembro.idOrganizacion, idOrganizacion), eq(organizacionMiembro.ownerCanonico, ownerCanonico)))
      .get();
    if (yaTomado) return false;

    tx.insert(organizacionMiembro)
      .values({ idOrganizacion, ownerCanonico, nombreDisplay, idUser: idUsuario, createdAt: new Date().toISOString() })
      .run();
    tx.update(user).set({ owner: ownerCanonico }).where(eq(user.id, idUsuario)).run();
    return true;
  });
}

// Helper solo para tests: crea una instancia Drizzle apuntando a un archivo de prueba, con
// el MISMO shape de schema que el singleton real (schema + authSchema) para que el tipo
// DbInstancia calce sin castear.
export function dbDePrueba(dbPath: string) {
  const sqlite = new Database(dbPath);
  return drizzle(sqlite, { schema: { ...schema, ...authSchema } });
}
