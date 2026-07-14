import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { colaLeads, colaCierres, colaReagendar } = await import('./repository.ts');

const OWNER = 'Sebastian Acosta Molina';
const OTRO_OWNER = 'Felipe Castro';

function seedEmpresa(
  id: string,
  owner: string,
  estadoNotion: string | null,
  proximoFollowUpFecha: string | null,
  idOrganizacion = 1,
) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, estado_notion, proximo_follow_up_fecha, organizacion_activa_id)
       VALUES (?, 'nit', ?, ?, 'activo', ?, ?, ?, ?)`,
    )
    .run(id, id, id, owner, estadoNotion, proximoFollowUpFecha, idOrganizacion);
  raw.close();
}

function seedToque(idEmpresa: string, resultado: string) {
  const raw = new Database(dbPath);
  raw.prepare(`INSERT INTO toque (id_empresa, resultado, fuente) VALUES (?, ?, 'cockpit')`).run(idEmpresa, resultado);
  raw.close();
}

test('colaLeads: solo estado lead, vencido o de hoy, del owner y organizacion pedidos', () => {
  seedEmpresa('l1', OWNER, 'lead', '2026-07-14'); // hoy: entra
  seedEmpresa('l2', OWNER, 'lead', '2026-07-10'); // vencido: entra
  seedEmpresa('l3', OWNER, 'lead', '2026-07-20'); // futuro: no entra
  seedEmpresa('l4', OWNER, 'lead', null); // sin fecha: no entra
  seedEmpresa('l5', OWNER, 'contacto_iniciado', '2026-07-10'); // otro estado: no entra
  seedEmpresa('l6', OTRO_OWNER, 'lead', '2026-07-10'); // otro owner: no entra

  const r = colaLeads('2026-07-14', OWNER, 1);
  const ids = r.map((f) => f.id).sort();
  assert.deepEqual(ids, ['l1', 'l2']);
});

test('colaCierres: estados calientes del owner, con y sin fecha, sin nocion de vencido', () => {
  // Organizacion 2, aislada: c6 (reunion_agendada + no_llego) tambien cumple el criterio
  // de colaReagendar, que corre en organizacion 1 en otro test de este mismo archivo (sin
  // limpieza entre tests, mismo problema documentado en repository.contarPorEstado.test.ts).
  seedEmpresa('c1', OWNER, 'oportunidad', '2026-07-10', 2); // vencido segun fecha: igual entra
  seedEmpresa('c2', OWNER, 'cierre_documentacion', null, 2); // sin fecha: igual entra
  seedEmpresa('c3', OWNER, 'reunion_agendada', '2026-08-01', 2); // futuro, sin toque: igual entra
  seedEmpresa('c4', OWNER, 'lead', '2026-07-10', 2); // no es estado caliente: no entra
  seedEmpresa('c5', OTRO_OWNER, 'oportunidad', '2026-07-10', 2); // otro owner: no entra

  seedEmpresa('c6', OWNER, 'reunion_agendada', '2026-07-10', 2);
  seedToque('c6', 'no_llego'); // no-show pendiente: se va a Reagendar, no entra aqui

  seedEmpresa('c7', OWNER, 'oportunidad', '2026-07-10', 2);
  seedToque('c7', 'no_llego'); // no_llego pero NO es reunion_agendada: si entra (la exclusion es solo para reunion_agendada)

  const r = colaCierres(OWNER, 2);
  const ids = r.map((f) => f.id).sort();
  assert.deepEqual(ids, ['c1', 'c2', 'c3', 'c7']);
});

test('colaReagendar: reunion_agendada cuyo ultimo toque fue no_llego, vencido o de hoy', () => {
  seedEmpresa('r1', OWNER, 'reunion_agendada', '2026-07-10');
  seedToque('r1', 'no_llego'); // vencido + no_llego: entra

  seedEmpresa('r2', OWNER, 'reunion_agendada', '2026-07-14');
  seedToque('r2', 'no_llego'); // hoy + no_llego: entra

  seedEmpresa('r3', OWNER, 'reunion_agendada', '2026-07-10');
  seedToque('r3', 'contesto_reunion'); // vencido pero ultimo resultado NO es no_llego: no entra

  seedEmpresa('r4', OWNER, 'reunion_agendada', '2026-07-10'); // sin ningun toque: no entra
  seedEmpresa('r5', OWNER, 'oportunidad', '2026-07-10');
  seedToque('r5', 'no_llego'); // no_llego pero no es reunion_agendada: no entra

  seedEmpresa('r6', OWNER, 'reunion_agendada', '2026-07-20');
  seedToque('r6', 'no_llego'); // no_llego pero fecha futura: no entra

  seedEmpresa('r7', OTRO_OWNER, 'reunion_agendada', '2026-07-10');
  seedToque('r7', 'no_llego'); // otro owner: no entra

  // r8: dos toques, el mas reciente NO es no_llego -- se reagendo con exito, ya no cuenta.
  seedEmpresa('r8', OWNER, 'reunion_agendada', '2026-07-10');
  seedToque('r8', 'no_llego');
  seedToque('r8', 'contesto_reunion');

  const r = colaReagendar('2026-07-14', OWNER, 1);
  const ids = r.map((f) => f.id).sort();
  assert.deepEqual(ids, ['r1', 'r2']);
});
