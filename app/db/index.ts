import path from 'node:path';
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
//
// DERIVADO de DB_PATH y no una ruta absoluta propia (2026-07-16): en el VPS
// ISPS_DB_PATH es /data/isps.db, y el .env.production de alla no tiene PRUEBAS_DB_PATH
// (se creo antes de que el modo prueba existiera). Con un default hardcodeado del Mac,
// desplegar esto tumbaba la web y el worker al arrancar. Derivarlo cumple lo que este
// comentario ya prometia: al lado de la real, sea cual sea.
function rutaPruebasPorDefecto(): string {
  if (DB_PATH === ':memory:') return ':memory:'; // tests: dos bases en RAM, no una en disco
  return path.join(path.dirname(DB_PATH), 'pruebas.db');
}

const PRUEBAS_DB_PATH = process.env.PRUEBAS_DB_PATH ?? rutaPruebasPorDefecto();

const sqliteReal = new Database(DB_PATH);
sqliteReal.pragma('journal_mode = WAL');

const esquema = { ...schema, ...authSchema };
const drizzleReal = drizzle(sqliteReal, { schema: esquema });

// PEREZOSA a proposito (2026-07-16): abrir pruebas.db al cargar el modulo obligaba a que
// existiera SIEMPRE, aunque nadie la use. Produccion nunca prende el modo prueba, pero
// pagaba el costo: `new Database()` con una ruta invalida truena al importar, no hay
// try/catch que valga, y se cae el proceso entero al arrancar. Ver pruebas-lazy.test.ts.
//
// Abrirla al primer uso invierte eso: prod no la pide nunca -> no truena nunca. En modo
// prueba se abre en la primera request, igual que antes. El error NO se traga: si la ruta
// es mala y alguien de verdad usa el modo prueba, revienta ahi, que es donde se debe ver.
let drizzlePruebasCache: typeof drizzleReal | null = null;
function drizzlePruebas(): typeof drizzleReal {
  if (!drizzlePruebasCache) {
    const sqlite = new Database(PRUEBAS_DB_PATH);
    sqlite.pragma('journal_mode = WAL');
    drizzlePruebasCache = drizzle(sqlite, { schema: esquema });
  }
  return drizzlePruebasCache;
}

// dbReal: la identidad (auth, membresia, preferencias, panel) NUNCA conmuta. Tu sesion
// es la misma en los dos modos; si conmutara, activar el modo prueba te sacaria a /login
// (tu sesion no existe en pruebas.db) y loguearte ahi crearia una cuenta duplicada.
export const dbReal = drizzleReal;

// Proxy y no la instancia: dbPruebas se importa a nivel de modulo (scripts de seed, tests),
// y esos imports NO deben abrir el archivo por el solo hecho de existir. Se abre al primer
// acceso a una propiedad, que es cuando alguien de verdad la va a usar.
export const dbPruebas: typeof drizzleReal = new Proxy({} as typeof drizzleReal, {
  get(_target, prop) {
    const base = drizzlePruebas();
    return Reflect.get(base, prop, base);
  },
});

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
    // drizzlePruebas() y no una instancia: solo se abre el archivo si esta request de
    // verdad corre en modo prueba (ver el comentario de la funcion arriba).
    const base = esModoPrueba() ? drizzlePruebas() : drizzleReal;
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
