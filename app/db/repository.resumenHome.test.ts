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
  organizacionActivaId = 1,
) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, estado_notion, proximo_follow_up_fecha, organizacion_activa_id)
       VALUES (?, 'nit', 'Empresa Test', 'empresa test', 'activo', ?, ?, ?, ?)`,
    )
    .run(id, OWNER, estadoNotion, proximoFollowUp, organizacionActivaId);
  raw.close();
}

// La frontera que fija este test: un lead es una cuenta ACTIVA del embudo pero NO un toque
// pendiente. Son dos preguntas distintas y por eso salen de dos lugares distintos --
// toquesHoy/vencidos derivan de colaDelDia (que desde 2026-07-15 excluye 'lead', contacto
// dormido), y cuentasActivas de ESTADOS_ACTIVOS, que sigue contandolos.
//
// resumenHome (Inicio) llama a colaDelDia, no reimplementa el filtro: por eso el numero de
// Inicio y el de /cola no pueden divergir. Esa es la razon de que el fix de la regla haya
// tocado este test sin tocar este archivo.
test('resumenHome cuenta toques de hoy, vencidos, deals calientes y cuentas activas', () => {
  // Cola: contacto_iniciado, 1 para hoy, 1 vencido (ayer), 1 futuro (no entra a la cola).
  seedEmpresa('c1', 'contacto_iniciado', HOY);
  seedEmpresa('c2', 'contacto_iniciado', '2026-07-06');
  seedEmpresa('c3', 'contacto_iniciado', '2026-07-20');

  // Leads con fecha vencida: NO son toques (dormidos), pero SI son cuentas activas.
  seedEmpresa('l1', 'lead', '2026-07-06');

  // Calientes (deals): reunion_agendada + oportunidad = 2. Activas: todo lo del funnel.
  seedEmpresa('h1', 'reunion_agendada', null);
  seedEmpresa('h2', 'oportunidad', null);
  // on_hold NO es activa; sin estado tampoco.
  seedEmpresa('p1', 'on_hold', null);
  seedEmpresa('p2', null, null);

  const r = resumenHome(OWNER, HOY, 1);

  assert.equal(r.toquesHoy, 2); // c1 (hoy) + c2 (vencido). l1 es lead: dormido, no cuenta
  assert.equal(r.vencidos, 1); // solo c2
  assert.equal(r.dealsCalientes, 2); // h1 + h2
  // Activas = estados del funnel: c1,c2,c3 + l1 (lead) + h1 + h2 = 6. on_hold y sin estado fuera.
  assert.equal(r.cuentasActivas, 6);
});

test('resumenHome no mezcla organizaciones', () => {
  seedEmpresa('otra-org-1', 'reunion_agendada', null, 2);

  const r = resumenHome(OWNER, HOY, 1);
  assert.equal(r.dealsCalientes, 2, 'h1+h2 de la organizacion 1, otra-org-1 (organizacion 2) no debe sumar');

  const r2 = resumenHome(OWNER, HOY, 2);
  assert.equal(r2.dealsCalientes, 1, 'solo otra-org-1');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
