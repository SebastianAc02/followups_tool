// Tarea 2 (rediseño UI de toque): getContextoToque junta en una sola llamada lo que el
// cockpit necesita para /llamada/[id] -- cuenta (via getCuenta), contacto principal,
// secuencia de la cadencia activa (si hay) y últimos toques.
// Corre con: npm test (ver scripts/resolve-ts-ext.mjs), NUNCA toca isps.db real.

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { getContextoToque } = await import('./repository.ts');

function raw() {
  return new Database(dbPath);
}

test('getContextoToque trae cuenta, contacto principal y secuencia vacia si no hay inscripcion', () => {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial)
     VALUES ('EMP_TEST', 'nit', 'RedNet', 'rednet', 'activo')`,
  ).run();
  db.prepare(
    `INSERT INTO contacto (id_empresa, nombre, cargo, telefono, email, es_principal, fuente)
     VALUES ('EMP_TEST', 'Carla', 'Gerente', '3001112233', 'carla@rednet.com', 1, 'seed')`,
  ).run();
  db.close();

  const ctx = getContextoToque('EMP_TEST');
  assert.equal(ctx.emp?.nombre, 'RedNet');
  assert.equal(ctx.principal?.nombre, 'Carla');
  assert.deepEqual(ctx.secuencia, []); // sin cadencia => riel degradado
  assert.equal(ctx.objetivo, null);
});

test('getContextoToque trae los pasos de la secuencia cuando hay inscripcion activa', () => {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial)
     VALUES ('EMP_INSCRITA', 'nit', 'Fibranet', 'fibranet', 'activo')`,
  ).run();
  const idContacto = db
    .prepare(
      `INSERT INTO contacto (id_empresa, nombre, cargo, telefono, email, es_principal, fuente)
       VALUES ('EMP_INSCRITA', 'Diego', 'CEO', '3009998877', 'diego@fibranet.com', 1, 'seed')`,
    )
    .run().lastInsertRowid as number;

  const idCadencia = db
    .prepare(`INSERT INTO cadencia (nombre, activa) VALUES ('Cadencia 4 pasos', 1)`)
    .run().lastInsertRowid as number;

  const pasoStmt = db.prepare(
    `INSERT INTO paso_cadencia (id_cadencia, orden, dia_offset, canal, objetivo) VALUES (?, ?, ?, ?, ?)`,
  );
  const idPaso1 = pasoStmt.run(idCadencia, 1, 0, 'correo', 'Presentacion').lastInsertRowid as number;
  const idPaso2 = pasoStmt.run(idCadencia, 2, 3, 'whatsapp', 'Seguimiento').lastInsertRowid as number;
  const idPaso3 = pasoStmt.run(idCadencia, 3, 7, 'correo', 'Reforzar valor').lastInsertRowid as number;
  const idPaso4 = pasoStmt.run(idCadencia, 4, 10, 'llamada', 'Sacar reunion').lastInsertRowid as number;

  const idVersion = db
    .prepare(`INSERT INTO version_paso (id_paso, asunto, cuerpo, es_default) VALUES (?, 'Asunto', 'Cuerpo', 1)`)
    .run(idPaso1).lastInsertRowid as number;

  const idSegmento = db
    .prepare(`INSERT INTO segmento (nombre, definicion) VALUES ('Seg', '{}')`)
    .run().lastInsertRowid as number;
  const idCampana = db
    .prepare(`INSERT INTO campana (nombre, id_cadencia, id_segmento) VALUES ('Camp', ?, ?)`)
    .run(idCadencia, idSegmento).lastInsertRowid as number;

  const idInscripcion = db
    .prepare(
      `INSERT INTO inscripcion (id_campana, id_empresa, estado, fecha_inscripcion) VALUES (?, 'EMP_INSCRITA', 'activa', datetime('now'))`,
    )
    .run(idCampana).lastInsertRowid as number;
  const idDestinatario = db
    .prepare(`INSERT INTO destinatario (id_inscripcion, id_contacto, estado) VALUES (?, ?, 'activo')`)
    .run(idInscripcion, idContacto).lastInsertRowid as number;

  const pasoInsStmt = db.prepare(
    `INSERT INTO paso_inscripcion (id_destinatario, id_paso, id_version, canal, estado, fecha_enviada) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  pasoInsStmt.run(idDestinatario, idPaso1, idVersion, 'correo', 'enviada', '2026-06-01');
  pasoInsStmt.run(idDestinatario, idPaso2, idVersion, 'whatsapp', 'enviada', '2026-06-04');
  pasoInsStmt.run(idDestinatario, idPaso3, idVersion, 'correo', 'enviada', '2026-06-08');
  pasoInsStmt.run(idDestinatario, idPaso4, idVersion, 'llamada', 'pendiente', null);
  db.close();

  const ctx = getContextoToque('EMP_INSCRITA');
  assert.equal(ctx.secuencia.length, 4);
  assert.equal(ctx.secuencia[0].estado, 'hecho');
  assert.equal(ctx.secuencia[1].estado, 'hecho');
  assert.equal(ctx.secuencia[2].estado, 'hecho');
  assert.equal(ctx.secuencia[3].estado, 'activo'); // el pendiente de hoy
  assert.equal(ctx.objetivo, 'Sacar reunion');
});

test('getContextoToque solo trae toques de la organizacion que consulta, aunque el lead sea compartido', () => {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO toque (id_empresa, fecha, canal, resultado, fuente, id_organizacion)
       VALUES ('EMP_TEST', '2026-07-01T00:00:00.000Z', 'llamada', 'contesto_no', 'test', 2)`,
    )
    .run();
  raw.close();

  const ctxOrg1 = getContextoToque('EMP_TEST', 1);
  assert.ok(!ctxOrg1.toques.some((t) => t.canal === 'llamada' && t.resultado === 'contesto_no'), 'no debe ver el toque de la organizacion 2');

  const ctxOrg2 = getContextoToque('EMP_TEST', 2);
  assert.ok(ctxOrg2.toques.some((t) => t.canal === 'llamada' && t.resultado === 'contesto_no'), 'si debe ver su propio toque');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
