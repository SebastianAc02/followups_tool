import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { colaContactoIniciadoConSeguimiento } = await import('./repository.ts');

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

function seedInscripcionActiva(idEmpresa: string, nombreCampana: string) {
  const raw = new Database(dbPath);
  raw.prepare(`INSERT INTO campana (nombre, id_cadencia, id_segmento) VALUES (?, 1, 1)`).run(nombreCampana);
  const idCampana = (raw.prepare(`SELECT last_insert_rowid() id`).get() as { id: number }).id;
  raw.prepare(`INSERT INTO inscripcion (id_campana, id_empresa, estado) VALUES (?, ?, 'activa')`).run(idCampana, idEmpresa);
  raw.close();
}

// Bucket faltante (2026-07-23): una empresa contacto_iniciado con fecha vencida-o-hoy y SIN
// cadencia activa era invisible en el split de Sebastian -- no cae en colaLeads (no es
// 'lead'), no cae en colaCierres (no es estado caliente), no cae en
// colaContactoIniciadoSinSeguimiento (esa exige fecha NULL) ni en agendaHoyCadencias (no
// tiene inscripcion). Pasa con toda cuenta reactivada trabajada a mano (Wicom, Intel Go).
test('colaContactoIniciadoConSeguimiento: contacto_iniciado con fecha vencida-o-hoy y sin cadencia activa entra; con cadencia o sin fecha no', () => {
  seedEmpresa('w1', OWNER, 'contacto_iniciado', '2026-07-14'); // hoy, sin cadencia: entra
  seedEmpresa('w2', OWNER, 'contacto_iniciado', '2026-07-10'); // vencido, sin cadencia: entra

  seedEmpresa('w3', OWNER, 'contacto_iniciado', '2026-07-10');
  seedInscripcionActiva('w3', 'Reactivacion express'); // cadencia activa: no entra (ya la cubre agendaHoyCadencias)

  seedEmpresa('w4', OWNER, 'contacto_iniciado', null); // sin fecha: no entra (esa es colaContactoIniciadoSinSeguimiento)

  seedEmpresa('w5', OWNER, 'contacto_iniciado', '2026-07-20'); // futuro: no entra
  seedEmpresa('w6', OWNER, 'lead', '2026-07-10'); // otro estado: no entra
  seedEmpresa('w7', OTRO_OWNER, 'contacto_iniciado', '2026-07-10'); // otro owner: no entra

  const r = colaContactoIniciadoConSeguimiento('2026-07-14', OWNER, 1);
  const ids = r.map((f) => f.id).sort();
  assert.deepEqual(ids, ['w1', 'w2']);
});
