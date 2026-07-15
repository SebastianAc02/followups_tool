import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import * as authSchema from './auth-schema';
import { esSoloLectura, ErrorSoloLectura } from '../lib/read-only';

// isps.db es la fuente de la verdad (un nivel arriba del proyecto).
const DB_PATH =
  process.env.ISPS_DB_PATH ??
  '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db';

// pruebas.db vive AL LADO de isps.db. Misma carpeta, mismo esquema, cero filas de
// negocio: en modo prueba es imposible mandarle correo a un ISP real porque no existe
// ninguno. Se crea con `ISPS_DB_PATH=../pruebas.db npm run migrate`.
const PRUEBAS_DB_PATH =
  process.env.PRUEBAS_DB_PATH ??
  '/Users/sebastianacostamolina/01_Documents/06_onepay/pruebas.db';

const sqliteReal = new Database(DB_PATH);
sqliteReal.pragma('journal_mode = WAL');

const sqlitePruebas = new Database(PRUEBAS_DB_PATH);
sqlitePruebas.pragma('journal_mode = WAL');

const esquema = { ...schema, ...authSchema };
const drizzleReal = drizzle(sqliteReal, { schema: esquema });
const drizzlePruebas = drizzle(sqlitePruebas, { schema: esquema });

// dbReal: la identidad (auth, membresia, preferencias, panel) NUNCA conmuta. Tu sesion
// es la misma en los dos modos; si conmutara, activar el modo prueba te sacaria a /login
// (tu sesion no existe en pruebas.db) y loguearte ahi crearia una cuenta duplicada.
export const dbReal = drizzleReal;
export const dbPruebas = drizzlePruebas;

const drizzleDb = drizzleReal;

// Candado solo-lectura (modo visitante): un unico punto que bloquea TODA escritura a la
// DB cuando la request esta marcada solo-lectura (ver app/lib/read-only.ts). Intercepta
// los 4 metodos de escritura de Drizzle -- insert/update/delete/transaction (no hay
// db.run crudo en el repo). Cualquier accion, gateada o no, cae aca: imposible que una
// escritura se le escape al candado. Las lecturas (.select, .query, etc.) pasan directo.
const METODOS_ESCRITURA = new Set(['insert', 'update', 'delete', 'transaction']);

export const db: typeof drizzleDb = new Proxy(drizzleDb, {
  get(target, prop, receiver) {
    const valor = Reflect.get(target, prop, receiver);
    if (typeof prop === 'string' && METODOS_ESCRITURA.has(prop) && typeof valor === 'function') {
      return (...args: unknown[]) => {
        if (esSoloLectura()) throw new ErrorSoloLectura();
        return (valor as (...a: unknown[]) => unknown).apply(target, args);
      };
    }
    return valor;
  },
});

export { schema };
