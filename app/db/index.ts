import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import * as authSchema from './auth-schema';
import { esSoloLectura, ErrorSoloLectura } from '../lib/read-only';

// isps.db es la fuente de la verdad (un nivel arriba del proyecto).
const DB_PATH =
  process.env.ISPS_DB_PATH ??
  '/Users/sebastianacostamolina/01_Documents/06_onepay/isps.db';

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');

const drizzleDb = drizzle(sqlite, { schema: { ...schema, ...authSchema } });

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
