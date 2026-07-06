// V4.1: prueba de la migracion de Fase 4 (grupos 1 y 2 del Anexo). No prueba logica
// de negocio (eso llega en V4.2-V4.6), solo el invariante estructural que la migracion
// promete: el indice unico parcial "una inscripcion activa por empresa".
// Corre contra la DB de prueba de test-helpers (nunca isps.db real).

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();

function db() {
  return new Database(dbPath);
}

test('las 7 tablas de Fase 4 existen tras crear la DB de prueba', () => {
  const raw = db();
  const nombres = raw
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN
       ('cadencia','paso_cadencia','version_paso','segmento','campana','inscripcion','destinatario')
       ORDER BY name`,
    )
    .all()
    .map((r: any) => r.name);
  assert.deepEqual(nombres, ['cadencia', 'campana', 'destinatario', 'inscripcion', 'paso_cadencia', 'segmento', 'version_paso']);
  raw.close();
});

test('el indice unico parcial rechaza una segunda inscripcion activa de la misma empresa', () => {
  const raw = db();
  raw.prepare(`INSERT INTO inscripcion (id_campana, id_empresa, estado) VALUES (1, 'emp-idx', 'activa')`).run();

  assert.throws(
    () => raw.prepare(`INSERT INTO inscripcion (id_campana, id_empresa, estado) VALUES (2, 'emp-idx', 'activa')`).run(),
    /UNIQUE constraint failed/,
    'una segunda inscripcion activa de la misma empresa debe ser rechazada',
  );
  raw.close();
});

test('una inscripcion bloqueada o finalizada NO cuenta contra el indice (WHERE parcial)', () => {
  const raw = db();
  // emp-idx ya tiene una activa del test anterior. Bloqueada y finalizada deben convivir.
  raw.prepare(`INSERT INTO inscripcion (id_campana, id_empresa, estado) VALUES (3, 'emp-idx', 'bloqueada')`).run();
  raw.prepare(`INSERT INTO inscripcion (id_campana, id_empresa, estado) VALUES (4, 'emp-idx', 'finalizada')`).run();
  // Otra empresa distinta tambien puede tener su propia activa.
  raw.prepare(`INSERT INTO inscripcion (id_campana, id_empresa, estado) VALUES (1, 'emp-otra', 'activa')`).run();

  const activas = raw.prepare(`SELECT count(*) c FROM inscripcion WHERE estado='activa'`).get() as any;
  assert.equal(activas.c, 2, 'dos empresas distintas, cada una con su activa');
  raw.close();
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
