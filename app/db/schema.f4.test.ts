// V5.1: prueba de la migracion del grupo 3 del Anexo (ejecucion y tracking). No prueba
// logica de negocio (eso llega en V5.2-V5.6), solo los invariantes estructurales que la
// migracion promete: un envio por destinatario+paso, y tracking idempotente por
// proveedor_evento_id. Corre contra la DB de prueba de test-helpers (nunca isps.db real).

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();

function db() {
  return new Database(dbPath);
}

test('las 2 tablas del grupo 3 existen tras crear la DB de prueba', () => {
  const raw = db();
  const nombres = raw
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN
       ('paso_inscripcion','evento_tracking') ORDER BY name`,
    )
    .all()
    .map((r: any) => r.name);
  assert.deepEqual(nombres, ['evento_tracking', 'paso_inscripcion']);
  raw.close();
});

test('el indice unico rechaza un segundo envio del mismo destinatario para el mismo paso', () => {
  const raw = db();
  raw
    .prepare(
      `INSERT INTO paso_inscripcion (id_destinatario, id_paso, id_version, canal)
       VALUES (1, 1, 1, 'correo')`,
    )
    .run();

  assert.throws(
    () =>
      raw
        .prepare(
          `INSERT INTO paso_inscripcion (id_destinatario, id_paso, id_version, canal)
           VALUES (1, 1, 1, 'correo')`,
        )
        .run(),
    /UNIQUE constraint failed/,
    'un segundo envio del mismo destinatario+paso debe ser rechazado (B6, nunca duplica)',
  );
  raw.close();
});

test('el mismo destinatario puede tener envios de pasos distintos', () => {
  const raw = db();
  raw
    .prepare(
      `INSERT INTO paso_inscripcion (id_destinatario, id_paso, id_version, canal)
       VALUES (1, 2, 1, 'correo')`,
    )
    .run();

  const total = raw
    .prepare(`SELECT count(*) c FROM paso_inscripcion WHERE id_destinatario = 1`)
    .get() as any;
  assert.equal(total.c, 2, 'dos pasos distintos del mismo destinatario conviven');
  raw.close();
});

test('el indice unico de evento_tracking rechaza el mismo proveedor_evento_id dos veces', () => {
  const raw = db();
  raw
    .prepare(
      `INSERT INTO evento_tracking (id_paso_inscripcion, tipo, canal, proveedor_evento_id)
       VALUES (1, 'abierto', 'correo', 'apollo-evt-1')`,
    )
    .run();

  assert.throws(
    () =>
      raw
        .prepare(
          `INSERT INTO evento_tracking (id_paso_inscripcion, tipo, canal, proveedor_evento_id)
           VALUES (1, 'abierto', 'correo', 'apollo-evt-1')`,
        )
        .run(),
    /UNIQUE constraint failed/,
    'el mismo evento de Apollo no puede insertarse dos veces (idempotencia del poll, V5.5)',
  );
  raw.close();
});

test('eventos con proveedor_evento_id distinto para el mismo paso_inscripcion conviven', () => {
  const raw = db();
  raw
    .prepare(
      `INSERT INTO evento_tracking (id_paso_inscripcion, tipo, canal, proveedor_evento_id)
       VALUES (1, 'respondio', 'correo', 'apollo-evt-2')`,
    )
    .run();

  const total = raw
    .prepare(`SELECT count(*) c FROM evento_tracking WHERE id_paso_inscripcion = 1`)
    .get() as any;
  assert.equal(total.c, 2, 'dos eventos distintos del mismo envio conviven (abierto + respondio)');
  raw.close();
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
