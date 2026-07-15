import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import * as authSchema from './auth-schema';
import { esSoloLectura, ErrorSoloLectura } from '../lib/read-only';
import { esModoPrueba } from '../lib/modo-prueba';

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

// El Proxy hace DOS cosas, y las dos en el mismo punto de choque:
//   1. Resuelve CONTRA QUE BASE corre esta request (esModoPrueba, ver app/lib/modo-prueba.ts).
//   2. Bloquea TODA escritura si la request es de un visitante (esSoloLectura, ver
//      app/lib/read-only.ts). Intercepta los 4 metodos de escritura de Drizzle --
//      insert/update/delete/transaction (no hay db.run crudo en runtime).
//
// Por eso repository.ts (5374 lineas) no tiene un solo if de modo prueba ni de candado:
// no puede olvidarse de chequear porque nunca chequea. Para cuando recibe su db, ya es
// la correcta. Cualquier accion, gateada o no, cae aca. Las lecturas pasan directo (pero
// igual salen de la base que resolvio el paso 1).
const METODOS_ESCRITURA = new Set(['insert', 'update', 'delete', 'transaction']);

export const db: typeof drizzleReal = new Proxy(drizzleReal, {
  get(_target, prop) {
    const base = esModoPrueba() ? drizzlePruebas : drizzleReal;
    // Receiver = base (no el proxy): si un getter de Drizzle leyera `this`, apuntar al
    // proxy lo haria recursar sobre este mismo handler.
    const valor = Reflect.get(base, prop, base);
    if (typeof prop === 'string' && METODOS_ESCRITURA.has(prop) && typeof valor === 'function') {
      return (...args: unknown[]) => {
        if (esSoloLectura()) throw new ErrorSoloLectura();
        return (valor as (...a: unknown[]) => unknown).apply(base, args);
      };
    }
    return valor;
  },
});

export { schema };
