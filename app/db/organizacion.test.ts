// Prueba estructural de las tablas de organizacion (V6.1). No prueba el flujo de registro
// completo (eso llega en Task 2 con organizacion-repository.test.ts). Corre contra la DB de
// prueba de test-helpers, nunca isps.db real.

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();

function db() {
  return new Database(dbPath);
}

test('las tablas organizacion y organizacion_miembro existen tras crear la DB de prueba', () => {
  const raw = db();
  const nombres = raw
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN
       ('organizacion','organizacion_miembro') ORDER BY name`,
    )
    .all()
    .map((r: any) => r.name);
  assert.deepEqual(nombres, ['organizacion', 'organizacion_miembro']);
  raw.close();
});

test('el indice unico parcial rechaza que dos miembros compartan el mismo id_user', () => {
  const raw = db();
  raw.prepare(`INSERT INTO organizacion (nombre) VALUES ('Onepay')`).run();
  raw
    .prepare(
      `INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display, id_user)
       VALUES (1, 'Thomas Schumacher', 'Thomas Schumacher', 'user-1')`,
    )
    .run();

  assert.throws(
    () =>
      raw
        .prepare(
          `INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display, id_user)
           VALUES (1, 'Felipe Castro', 'Felipe Castro', 'user-1')`,
        )
        .run(),
    /UNIQUE constraint failed/,
    'una cuenta no puede reclamar dos nombres (indice parcial sobre id_user IS NOT NULL)',
  );
  raw.close();
});

test('dos miembros con id_user NULL conviven sin problema (nadie los ha reclamado)', () => {
  const raw = db();
  raw
    .prepare(
      `INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display)
       VALUES (1, 'Felipe Castro', 'Felipe Castro')`,
    )
    .run();
  raw
    .prepare(
      `INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display)
       VALUES (1, 'Camilo fonseca', 'Camilo Fonseca')`,
    )
    .run();

  const total = raw
    .prepare(`SELECT count(*) c FROM organizacion_miembro WHERE id_user IS NULL`)
    .get() as any;
  assert.equal(total.c, 2, 'varios miembros sin reclamar conviven (el indice es parcial)');
  raw.close();
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
