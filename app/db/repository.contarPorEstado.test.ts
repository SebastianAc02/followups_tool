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

function seedEmpresa(id: string, owner: string, estadoNotion: string | null, organizacionActivaId = 1) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, estado_notion, organizacion_activa_id)
       VALUES (?, 'nit', 'Empresa Test', 'empresa test', 'activo', ?, ?, ?)`,
    )
    .run(id, owner, estadoNotion, organizacionActivaId);
  raw.close();
}

test('contarPorEstado agrupa por estado_notion y excluye los null', () => {
  seedEmpresa('e1', OWNER_A, 'lead');
  seedEmpresa('e2', OWNER_A, 'lead');
  seedEmpresa('e3', OWNER_A, 'oportunidad');
  seedEmpresa('e4', OWNER_A, null); // sin estado: no aparece

  const r = contarPorEstado(undefined, 1);

  assert.equal(r.lead, 2);
  assert.equal(r.oportunidad, 1);
  assert.equal(r['null'], undefined);
  assert.equal(Object.keys(r).length, 2);
});

test('contarPorEstado con owner filtra por ese owner', () => {
  seedEmpresa('e5', OWNER_B, 'lead');
  seedEmpresa('e6', OWNER_B, 'reunion_agendada');

  const soloB = contarPorEstado(OWNER_B, 1);
  assert.equal(soloB.lead, 1);
  assert.equal(soloB.reunion_agendada, 1);

  // Sin owner cuenta A + B juntos: lead = 2 (A) + 1 (B) = 3.
  const todos = contarPorEstado(undefined, 1);
  assert.equal(todos.lead, 3);
});

test('contarPorEstado no mezcla organizaciones aunque no se filtre por owner', () => {
  // Uso las organizaciones 3 y 4 en vez de 1 y 2 como escribe el plan original: la
  // organizacion 1 ya tiene datos sembrados por los dos tests anteriores de este mismo
  // archivo (e1, e2 de OWNER_A y e5 de OWNER_B, los tres con estado_notion 'lead'), y este
  // archivo comparte una sola DB temporal sin limpieza entre tests (mismo problema de
  // contaminacion que Task 10 encontro en repository.contadoresHoy.test.ts). Si reusara la
  // organizacion 1 aqui, contarPorEstado(undefined, 1).lead daria 3 (e1+e2+e5), no 2, por
  // datos que no tienen nada que ver con este test. Las organizaciones 3 y 4 estan limpias.
  seedEmpresa('e7', OWNER_A, 'lead', 3);
  seedEmpresa('e8', OWNER_A, 'lead', 3);
  seedEmpresa('e9', OWNER_A, 'lead', 4);

  const soloOrg3 = contarPorEstado(undefined, 3);
  assert.equal(soloOrg3.lead, 2, 'e7 y e8 (organizacion 3); e9 (organizacion 4) no debe sumar aqui');

  const soloOrg4 = contarPorEstado(undefined, 4);
  assert.equal(soloOrg4.lead, 1, 'solo e9');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
