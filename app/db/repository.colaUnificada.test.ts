// V5.7: cola del dia unificada. agendaHoyCadencias trae en un solo query los toques
// automaticos y manuales de hoy/atrasados, distinguidos por esManual, para que la UI
// (/cola) los muestre juntos en una sola pantalla.

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const {
  crearCadencia,
  guardarSegmento,
  crearCampana,
  inscribirCampana,
  destinatariosDeInscripcion,
  historialInscripciones,
  crearPasoInscripcionPendiente,
  marcarPasoInscripcionEnviada,
  agendaHoyCadencias,
} = await import('./repository.ts');

function raw() {
  return new Database(dbPath);
}

function seedEmpresa(id: string, categoria: string, email: string) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, categoria)
     VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', ?)`,
  ).run(id, id, id.toLowerCase(), categoria);
  db.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, email, fuente) VALUES (?, 'Contacto', 0, 1, ?, 'seed')`,
  ).run(id, email);
  db.close();
}

function fijarFechaProgramada(idPasoInscripcion: number, fecha: string) {
  const db = raw();
  db.prepare('UPDATE paso_inscripcion SET fecha_programada = ? WHERE id_paso_inscripcion = ?').run(fecha, idPasoInscripcion);
  db.close();
}

function idsDePaso(idCadencia: number, orden: number) {
  const db = raw();
  const paso = db.prepare('SELECT id_paso FROM paso_cadencia WHERE id_cadencia = ? AND orden = ?').get(idCadencia, orden) as any;
  const version = db.prepare('SELECT id_version FROM version_paso WHERE id_paso = ?').get(paso.id_paso) as any;
  db.close();
  return { idPaso: paso.id_paso, idVersion: version.id_version };
}

seedEmpresa('e-cola-1', 'cola-cat-1', 'auto@empresa.com');
seedEmpresa('e-cola-2', 'cola-cat-2', 'manual@empresa.com');

const idCadencia = crearCadencia({
  nombre: 'C cola',
  pasos: [
    { orden: 1, diaOffset: 0, canal: 'correo', asunto: 'Auto', cuerpo: 'x' },
    { orden: 2, diaOffset: 0, canal: 'llamada', objetivo: 'Tier 1', esManual: true },
  ],
});
const idSeg1 = guardarSegmento({ nombre: 'cola-seg-1', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['cola-cat-1'] }] } });
const idSeg2 = guardarSegmento({ nombre: 'cola-seg-2', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['cola-cat-2'] }] } });

const idCampanaAuto = crearCampana({ nombre: 'Camp auto', idCadencia, idSegmento: idSeg1 });
inscribirCampana(idCampanaAuto);
const idCampanaManual = crearCampana({ nombre: 'Camp manual', idCadencia, idSegmento: idSeg2 });
inscribirCampana(idCampanaManual);

const idInscAuto = historialInscripciones('e-cola-1').find((i) => i.estado === 'activa')!.id;
const idDestAuto = destinatariosDeInscripcion(idInscAuto)[0].id;
const idInscManual = historialInscripciones('e-cola-2').find((i) => i.estado === 'activa')!.id;
const idDestManual = destinatariosDeInscripcion(idInscManual)[0].id;

const { idPaso: idPasoAuto, idVersion: idVersionAuto } = idsDePaso(idCadencia, 1);
const { idPaso: idPasoManual, idVersion: idVersionManual } = idsDePaso(idCadencia, 2);

const idPIAuto = crearPasoInscripcionPendiente({ idDestinatario: idDestAuto, idPaso: idPasoAuto, idVersion: idVersionAuto, canal: 'correo' });
const idPIManual = crearPasoInscripcionPendiente({ idDestinatario: idDestManual, idPaso: idPasoManual, idVersion: idVersionManual, canal: 'llamada' });

test('el automatico y el manual de HOY conviven en el mismo query', () => {
  fijarFechaProgramada(idPIAuto, '2026-07-06T09:00:00.000Z');
  fijarFechaProgramada(idPIManual, '2026-07-06T09:00:00.000Z');

  const agenda = agendaHoyCadencias('2026-07-06');
  const auto = agenda.find((f) => f.idPasoInscripcion === idPIAuto);
  const manual = agenda.find((f) => f.idPasoInscripcion === idPIManual);

  assert.ok(auto);
  assert.strictEqual(auto!.esManual, 0);
  assert.ok(manual);
  assert.strictEqual(manual!.esManual, 1);
});

test('un toque de HOY con hora (datetime completo) SI aparece (no lo esconde la comparacion de fecha)', () => {
  fijarFechaProgramada(idPIAuto, '2026-07-06T23:00:00.000Z'); // tarde en el dia, sigue siendo "hoy"
  const agenda = agendaHoyCadencias('2026-07-06');
  assert.ok(agenda.some((f) => f.idPasoInscripcion === idPIAuto));
});

test('un toque programado para MAÑANA no aparece en la cola de hoy', () => {
  fijarFechaProgramada(idPIAuto, '2026-07-07T09:00:00.000Z');
  const agenda = agendaHoyCadencias('2026-07-06');
  assert.ok(!agenda.some((f) => f.idPasoInscripcion === idPIAuto));
});

test('un toque atrasado (fecha_programada de ayer) aparece hoy', () => {
  fijarFechaProgramada(idPIAuto, '2026-07-04T09:00:00.000Z');
  const agenda = agendaHoyCadencias('2026-07-06');
  assert.ok(agenda.some((f) => f.idPasoInscripcion === idPIAuto));
});

test('un toque ya enviado no aparece mas en la cola', () => {
  fijarFechaProgramada(idPIAuto, '2026-07-06T09:00:00.000Z');
  marcarPasoInscripcionEnviada(idPIAuto, 'msg-1', '2026-07-06T09:00:00.000Z');
  const agenda = agendaHoyCadencias('2026-07-06');
  assert.ok(!agenda.some((f) => f.idPasoInscripcion === idPIAuto));
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
