// El invariante que de verdad importa: en modo prueba, isps.db no recibe NI UNA escritura.
//
// El caso "sin modo declarado" NO se prueba aca: necesita un proceso sin marca, y el
// setup global (scripts/test-setup.ts) ya marco modo real. Vive en
// app/db/aislado/modo-prueba-throw.test.ts, que corre con `npm run test:aislado`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { db, dbReal, dbPruebas } from './index.ts';
import { organizacion } from './schema.ts';
import { marcarModoPrueba } from '../lib/modo-prueba.ts';
import { marcarSoloLectura } from '../lib/read-only.ts';

// :memory: nace sin esquema (ver dos-conexiones.test.ts): la tabla se crea en las dos.
const DDL_ORGANIZACION = sql`
  CREATE TABLE IF NOT EXISTS organizacion (
    id_organizacion INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    created_at TEXT
  )
`;
dbReal.run(DDL_ORGANIZACION);
dbPruebas.run(DDL_ORGANIZACION);

test('en modo prueba, db escribe en pruebas.db y NO toca la real', () => {
  marcarSoloLectura(false);
  marcarModoPrueba(true);

  db.insert(organizacion).values({ nombre: 'nacida-en-prueba' }).run();

  const enPruebas = dbPruebas.select().from(organizacion).all();
  const enReal = dbReal.select().from(organizacion).all();

  assert.ok(enPruebas.some((o) => o.nombre === 'nacida-en-prueba'), 'debe estar en pruebas.db');
  assert.ok(!enReal.some((o) => o.nombre === 'nacida-en-prueba'), 'isps.db NO debe recibir la escritura');
  marcarModoPrueba(false);
});

test('en modo real, db escribe en isps.db y NO toca la de pruebas', () => {
  marcarSoloLectura(false);
  marcarModoPrueba(false);

  db.insert(organizacion).values({ nombre: 'nacida-en-real' }).run();

  const enReal = dbReal.select().from(organizacion).all();
  const enPruebas = dbPruebas.select().from(organizacion).all();

  assert.ok(enReal.some((o) => o.nombre === 'nacida-en-real'), 'debe estar en isps.db');
  assert.ok(!enPruebas.some((o) => o.nombre === 'nacida-en-real'), 'pruebas.db NO debe recibirla');
});

test('el candado solo-lectura sigue vivo dentro del modo prueba', () => {
  marcarModoPrueba(true);
  marcarSoloLectura(true);
  assert.throws(() => db.insert(organizacion), /solo lectura/i);
  marcarSoloLectura(false);
  marcarModoPrueba(false);
});
