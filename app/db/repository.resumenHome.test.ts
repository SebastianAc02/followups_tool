// Pruebas de Repository para resumenHome (rediseño home).
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { resumenHome } = await import('./repository.ts');

const HOY = '2026-07-07';
const OWNER = 'Sebastian Acosta Molina';

function seedEmpresa(
  id: string,
  estadoNotion: string | null,
  proximoFollowUp: string | null,
) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, estado_notion, proximo_follow_up_fecha)
       VALUES (?, 'nit', 'Empresa Test', 'empresa test', 'activo', ?, ?, ?)`,
    )
    .run(id, OWNER, estadoNotion, proximoFollowUp);
  raw.close();
}

test('resumenHome cuenta toques de hoy, vencidos, deals calientes y cuentas activas', () => {
  // Cola: 1 para hoy, 1 vencido (ayer), 1 futuro (no entra a la cola).
  seedEmpresa('c1', 'lead', HOY);
  seedEmpresa('c2', 'lead', '2026-07-06');
  seedEmpresa('c3', 'lead', '2026-07-20');

  // Calientes (deals): reunion_agendada + oportunidad = 2. Activas: todo lo del funnel.
  seedEmpresa('h1', 'reunion_agendada', null);
  seedEmpresa('h2', 'oportunidad', null);
  // on_hold NO es activa; sin estado tampoco.
  seedEmpresa('p1', 'on_hold', null);
  seedEmpresa('p2', null, null);

  const r = resumenHome(OWNER, HOY);

  assert.equal(r.toquesHoy, 2); // c1 (hoy) + c2 (vencido) están en la cola de hoy
  assert.equal(r.vencidos, 1); // solo c2
  assert.equal(r.dealsCalientes, 2); // h1 + h2
  // Activas = estados del funnel: c1,c2,c3 (lead) + h1 + h2 = 5. on_hold y sin estado fuera.
  assert.equal(r.cuentasActivas, 5);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
