// A que base pertenece un evento de tracking de correo. Gemelo de ruteo-linea.test.ts: los
// mismos cinco casos, porque la regla es la misma y cualquier divergencia entre las dos seria
// un bug (dos entradas sin sesion decidiendo la base con criterios distintos).
//
// Lo que cubre y no cubre el resto de la suite: que el pixel y el clic tengan COMO resolver la
// base sin cookie. El bug que esto cierra vivio tres semanas sin que nadie lo viera, porque el
// evento descartado no dejaba rastro (ver el catch mudo que este mismo commit quita en
// api/track/open/route.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { dbReal, dbPruebas } from './index.ts';
import { esCampanaDePruebas } from './ruteo-campana.ts';

const DDL = sql`
  CREATE TABLE IF NOT EXISTS campana (
    id_campana INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    id_cadencia INTEGER NOT NULL,
    id_segmento INTEGER NOT NULL,
    estado TEXT NOT NULL DEFAULT 'borrador',
    modo TEXT NOT NULL DEFAULT 'prioritaria',
    regla_faltante TEXT NOT NULL DEFAULT 'cola',
    ritmo_ingreso TEXT NOT NULL DEFAULT 'diario',
    owner TEXT,
    id_organizacion INTEGER NOT NULL,
    proveedor_campana_id TEXT
  )
`;
dbReal.run(DDL);
dbPruebas.run(DDL);

function sembrar(base: typeof dbReal, nombre: string, proveedorCampanaId: string) {
  base.run(
    sql`INSERT INTO campana (nombre, id_cadencia, id_segmento, id_organizacion, proveedor_campana_id)
        VALUES (${nombre}, 1, 1, 1, ${proveedorCampanaId})`,
  );
}

sembrar(dbPruebas, 'Demo 8 toques', 'gmail-camp-7');
sembrar(dbReal, 'Precio ISPs A', '6a50ef01158e040010c83d7f');
// El caso que de verdad puede pasar: el correlator de Gmail es sintetico y derivado del
// id_campana, y las dos bases tienen secuencias independientes. Tarde o temprano el mismo
// string existe en las dos.
sembrar(dbPruebas, 'Demo colision', 'gmail-camp-42');
sembrar(dbReal, 'Campana real 42', 'gmail-camp-42');

test('una campana que solo existe en pruebas.db es de prueba', () => {
  assert.equal(esCampanaDePruebas('gmail-camp-7'), true);
});

test('una campana que solo existe en la real NO es de prueba', () => {
  assert.equal(esCampanaDePruebas('6a50ef01158e040010c83d7f'), false);
});

// La asimetria, que es la decision de diseño y no un descuido. Un evento de prueba escrito en
// la real ensucia una metrica; una apertura REAL escrita en pruebas.db se pierde del lado que
// importa y el operador lee "no lo abrio" sobre alguien que si lo abrio.
test('si el id existe en LAS DOS, gana la real (ante la duda, no aislar)', () => {
  assert.equal(
    esCampanaDePruebas('gmail-camp-42'),
    false,
    'la colision de correlator sintetico nunca debe robarle una apertura a la base real',
  );
});

test('un id que no existe en ningun lado no es de prueba (default real)', () => {
  assert.equal(esCampanaDePruebas('gmail-camp-nunca-vista'), false);
});

test('sin id (query string incompleto) no es de prueba', () => {
  assert.equal(esCampanaDePruebas(''), false);
});
