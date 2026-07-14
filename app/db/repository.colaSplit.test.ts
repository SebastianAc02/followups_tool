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
