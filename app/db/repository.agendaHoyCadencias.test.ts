import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { agendaHoyCadencias } = await import('./repository.ts');

function raw() {
  return new Database(dbPath);
}

function ultimoId(db: Database.Database): number {
  return (db.prepare(`SELECT last_insert_rowid() id`).get() as { id: number }).id;
}

function seedPasoPendiente(idEmpresa: string, owner: string, canal: string) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, estado_notion, ciudad_principal, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'activo', ?, 'contacto_iniciado', 'Bogota', 1)`,
  ).run(idEmpresa, idEmpresa, idEmpresa, owner);
  db.prepare(`INSERT INTO contacto (id_empresa, nombre, email, es_principal, fuente) VALUES (?, 'Ana', 'ana@test.com', 1, 'seed')`).run(idEmpresa);
  const idContacto = (db.prepare(`SELECT id_contacto id FROM contacto WHERE id_empresa = ?`).get(idEmpresa) as { id: number }).id;

  db.prepare(`INSERT INTO cadencia (nombre) VALUES ('Cadencia test')`).run();
  const idCadencia = ultimoId(db);
  db.prepare(`INSERT INTO paso_cadencia (id_cadencia, orden, dia_offset, canal, es_manual) VALUES (?, 1, 0, ?, 1)`).run(idCadencia, canal);
  const idPaso = ultimoId(db);
  db.prepare(`INSERT INTO version_paso (id_paso, es_default) VALUES (?, 1)`).run(idPaso);
  const idVersion = ultimoId(db);

  db.prepare(`INSERT INTO segmento (nombre, definicion, id_organizacion) VALUES ('Seg test', '{}', 1)`).run();
  const idSegmento = ultimoId(db);
  db.prepare(`INSERT INTO campana (nombre, id_cadencia, id_segmento, estado) VALUES ('Campana test', ?, ?, 'activa')`).run(idCadencia, idSegmento);
  const idCampana = ultimoId(db);
  db.prepare(`INSERT INTO inscripcion (id_campana, id_empresa, estado) VALUES (?, ?, 'activa')`).run(idCampana, idEmpresa);
  const idInscripcion = ultimoId(db);
  db.prepare(`INSERT INTO destinatario (id_inscripcion, id_contacto, estado) VALUES (?, ?, 'activo')`).run(idInscripcion, idContacto);
  const idDestinatario = ultimoId(db);
  db.prepare(
    `INSERT INTO paso_inscripcion (id_destinatario, id_paso, id_version, canal, estado, fecha_programada) VALUES (?, ?, ?, ?, 'pendiente', '2026-07-10')`,
  ).run(idDestinatario, idPaso, idVersion, canal);
  db.close();
}

test('agendaHoyCadencias: sin owner trae todo, con owner filtra', () => {
  seedPasoPendiente('a1', 'Sebastian Acosta Molina', 'llamada');
  seedPasoPendiente('a2', 'Felipe Castro', 'llamada');

  const todos = agendaHoyCadencias('2026-07-14');
  assert.equal(todos.length, 2);

  const soloSebastian = agendaHoyCadencias('2026-07-14', 'Sebastian Acosta Molina');
  assert.equal(soloSebastian.length, 1);
  assert.equal(soloSebastian[0].idEmpresa, 'a1');
});

test('agendaHoyCadencias: trae estadoNotion, ciudad y nombreCampana', () => {
  const fila = agendaHoyCadencias('2026-07-14', 'Sebastian Acosta Molina')[0];
  assert.equal(fila.estadoNotion, 'contacto_iniciado');
  assert.equal(fila.ciudad, 'Bogota');
  assert.equal(fila.nombreCampana, 'Campana test');
});
