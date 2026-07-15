// Las dos conexiones son independientes: una escritura en una NO se ve en la otra.
// Es el invariante que hace posible el modo prueba; si esto falla, todo lo demas miente.
//
// Ojo con :memory: (ISPS_DB_PATH/PRUEBAS_DB_PATH en el script de test): las dos bases
// nacen VACIAS, sin esquema. read-only.test.ts no lo nota porque hace db.insert() sin
// .run() (arma el query builder y nunca ejecuta). Aca si ejecutamos de verdad -- que es
// el punto: probar el aislamiento con escrituras reales -- asi que la tabla se crea a
// mano en las dos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { dbReal, dbPruebas } from './index.ts';
import { organizacion } from './schema.ts';

const DDL_ORGANIZACION = sql`
  CREATE TABLE IF NOT EXISTS organizacion (
    id_organizacion INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    created_at TEXT
  )
`;

test('dbReal y dbPruebas son conexiones distintas y aisladas', () => {
  dbReal.run(DDL_ORGANIZACION);
  dbPruebas.run(DDL_ORGANIZACION);

  dbReal.insert(organizacion).values({ nombre: 'solo-en-real' }).run();

  const enReal = dbReal.select().from(organizacion).all();
  const enPruebas = dbPruebas.select().from(organizacion).all();

  assert.equal(enReal.length, 1, 'la real debe tener su fila');
  assert.equal(enPruebas.length, 0, 'la de pruebas NO debe ver lo escrito en la real');
});
