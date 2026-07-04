// Pruebas de Repository para contadoresHoy (V1.5).
// Corre con: node --experimental-strip-types --test app/db/*.test.ts
// (desde la raíz del proyecto, para que node_modules resuelva better-sqlite3/drizzle).
//
// Usa una DB SQLite de archivo temporal (ver test-helpers.ts). NUNCA toca isps.db real.

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { contadoresHoy } = await import('./repository.ts');

const HOY = '2026-07-03';
const OWNER_A = 'Sebastian Acosta Molina';
const OWNER_B = 'Felipe Castro';

function seedEmpresa(idEmpresa: string, owner: string) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner)
       VALUES (?, 'nit', 'Empresa Test', 'empresa test', 'activo', ?)`,
    )
    .run(idEmpresa, owner);
  raw.close();
}

function seedToque(idEmpresa: string, fechaISO: string, canal: string, resultado: string) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO toque (id_empresa, fecha, canal, resultado, fuente)
       VALUES (?, ?, ?, ?, 'test')`,
    )
    .run(idEmpresa, fechaISO, canal, resultado);
  raw.close();
}

test('contadoresHoy cuenta solo los toques de HOY del owner correcto, por canal y por resultado', () => {
  seedEmpresa('emp-a1', OWNER_A);
  seedEmpresa('emp-a2', OWNER_A);
  seedEmpresa('emp-b1', OWNER_B);

  // Toques de HOY, owner A: 2 llamada, 1 whatsapp, 1 correo
  seedToque('emp-a1', `${HOY}T09:00:00.000Z`, 'llamada', 'contesto_reunion');
  seedToque('emp-a1', `${HOY}T10:00:00.000Z`, 'llamada', 'no_contesto');
  seedToque('emp-a2', `${HOY}T11:00:00.000Z`, 'whatsapp', 'contesto_sigue_seguimiento');
  seedToque('emp-a2', `${HOY}T12:00:00.000Z`, 'correo', 'contesto_no');

  // Toque de OTRO día, owner A: no debe contar
  seedToque('emp-a1', '2026-07-02T09:00:00.000Z', 'llamada', 'contesto_reunion');

  // Toque de HOY pero owner B: no debe contar en el conteo de A
  seedToque('emp-b1', `${HOY}T09:00:00.000Z`, 'llamada', 'contesto_reunion');

  const resultado = contadoresHoy(HOY, OWNER_A);

  assert.equal(resultado.porCanal.llamada, 2);
  assert.equal(resultado.porCanal.whatsapp, 1);
  assert.equal(resultado.porCanal.correo, 1);

  assert.equal(resultado.porResultado.contesto_reunion, 1);
  assert.equal(resultado.porResultado.contesto_sigue_seguimiento, 1);
  assert.equal(resultado.porResultado.contesto_no, 1);
  assert.equal(resultado.porResultado.no_contesto, 1);

  assert.equal(resultado.total, 4);

  // Owner B solo tiene su propio toque de hoy
  const resultadoB = contadoresHoy(HOY, OWNER_B);
  assert.equal(resultadoB.total, 1);
  assert.equal(resultadoB.porCanal.llamada, 1);
  assert.equal(resultadoB.porCanal.whatsapp, 0);
  assert.equal(resultadoB.porCanal.correo, 0);
});

test('contadoresHoy devuelve todo en cero cuando no hay toques hoy', () => {
  const OWNER_C = 'Thomas Schumacher';
  seedEmpresa('emp-c1', OWNER_C);
  seedToque('emp-c1', '2026-01-01T09:00:00.000Z', 'llamada', 'contesto_reunion');

  const resultado = contadoresHoy(HOY, OWNER_C);

  assert.equal(resultado.total, 0);
  assert.equal(resultado.porCanal.llamada, 0);
  assert.equal(resultado.porCanal.whatsapp, 0);
  assert.equal(resultado.porCanal.correo, 0);
  assert.equal(resultado.porResultado.contesto_reunion, 0);
  assert.equal(resultado.porResultado.contesto_sigue_seguimiento, 0);
  assert.equal(resultado.porResultado.contesto_no, 0);
  assert.equal(resultado.porResultado.no_contesto, 0);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
