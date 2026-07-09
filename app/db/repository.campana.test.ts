// Pruebas de Repository para mutaciones directas sobre campana que todavia no validaban
// organizacion (Plan 3, Task 2): actualizarReglaFaltante y guardarProveedorCampanaId.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { actualizarReglaFaltante, guardarProveedorCampanaId } = await import('./repository.ts');

// Sembrado directo por SQL crudo (no crearCampana): solo necesitamos una fila de campana
// con id_organizacion fijo, sin cadencia/segmento reales detras (la DB de prueba no fuerza
// foreign keys, ver test-helpers.ts).
function seedCampana(idOrganizacion: number): number {
  const raw = new Database(dbPath);
  const info = raw
    .prepare(
      `INSERT INTO campana (nombre, id_cadencia, id_segmento, regla_faltante, id_organizacion)
       VALUES (?, 1, 1, 'cola', ?)`,
    )
    .run('Campana test guard', idOrganizacion);
  raw.close();
  return Number(info.lastInsertRowid);
}

function leerCampana(idCampana: number) {
  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT regla_faltante, proveedor_campana_id FROM campana WHERE id_campana = ?').get(idCampana) as {
    regla_faltante: string;
    proveedor_campana_id: string | null;
  };
  raw.close();
  return fila;
}

test('actualizarReglaFaltante lanza si la campana es de otra organizacion', () => {
  const idCampana = seedCampana(2);

  assert.throws(() => actualizarReglaFaltante(idCampana, 'saltar', 1));

  // No debe haber tocado el valor original.
  assert.equal(leerCampana(idCampana).regla_faltante, 'cola');
});

test('actualizarReglaFaltante actualiza cuando la organizacion coincide', () => {
  const idCampana = seedCampana(2);

  actualizarReglaFaltante(idCampana, 'saltar', 2);

  assert.equal(leerCampana(idCampana).regla_faltante, 'saltar');
});

test('guardarProveedorCampanaId lanza si la campana es de otra organizacion', () => {
  const idCampana = seedCampana(2);

  assert.throws(() => guardarProveedorCampanaId(idCampana, 'apollo-seq-x', 1));

  assert.equal(leerCampana(idCampana).proveedor_campana_id, null);
});

test('guardarProveedorCampanaId actualiza cuando la organizacion coincide', () => {
  const idCampana = seedCampana(2);

  guardarProveedorCampanaId(idCampana, 'apollo-seq-x', 2);

  assert.equal(leerCampana(idCampana).proveedor_campana_id, 'apollo-seq-x');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
