// Pruebas de Repository para contarPorEstado (rediseño home).
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { contarPorEstado } = await import('./repository.ts');

const OWNER_A = 'Sebastian Acosta Molina';
const OWNER_B = 'Felipe Castro';

function seedEmpresa(id: string, owner: string, estadoNotion: string | null) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, estado_notion)
       VALUES (?, 'nit', 'Empresa Test', 'empresa test', 'activo', ?, ?)`,
    )
    .run(id, owner, estadoNotion);
  raw.close();
}

test('contarPorEstado agrupa por estado_notion y excluye los null', () => {
  seedEmpresa('e1', OWNER_A, 'lead');
  seedEmpresa('e2', OWNER_A, 'lead');
  seedEmpresa('e3', OWNER_A, 'oportunidad');
  seedEmpresa('e4', OWNER_A, null); // sin estado: no aparece

  const r = contarPorEstado();

  assert.equal(r.lead, 2);
  assert.equal(r.oportunidad, 1);
  assert.equal(r['null'], undefined);
  assert.equal(Object.keys(r).length, 2);
});

test('contarPorEstado con owner filtra por ese owner', () => {
  seedEmpresa('e5', OWNER_B, 'lead');
  seedEmpresa('e6', OWNER_B, 'reunion_agendada');

  const soloB = contarPorEstado(OWNER_B);
  assert.equal(soloB.lead, 1);
  assert.equal(soloB.reunion_agendada, 1);

  // Sin owner cuenta A + B juntos: lead = 2 (A) + 1 (B) = 3.
  const todos = contarPorEstado();
  assert.equal(todos.lead, 3);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
