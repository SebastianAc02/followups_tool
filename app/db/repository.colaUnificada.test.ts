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
  historialPasosDestinatario,
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
const idSeg1 = guardarSegmento({ nombre: 'cola-seg-1', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['cola-cat-1'] }] } }, 1);
const idSeg2 = guardarSegmento({ nombre: 'cola-seg-2', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['cola-cat-2'] }] } }, 1);

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
  marcarPasoInscripcionEnviada(idPIAuto, 'apollo', 'msg-1', '2026-07-06T09:00:00.000Z');
  const agenda = agendaHoyCadencias('2026-07-06');
  assert.ok(!agenda.some((f) => f.idPasoInscripcion === idPIAuto));
});

// Parte 4 campanas: agendaHoyCadencias necesita el copy completo (no solo asunto),
// las variables detectadas, el flag de firma, y en que dia/paso de la cadencia va
// esto -- sin eso el manual no tiene con que personalizar antes de aprobar.
seedEmpresa('e-cola-3', 'cola-cat-3', 'personalizar@empresa.com');
const idCadenciaCopy = crearCadencia({
  nombre: 'C copy',
  pasos: [
    {
      orden: 1,
      diaOffset: 0,
      canal: 'correo',
      asunto: 'Hola [nombre]',
      cuerpo: 'Cuerpo [nombre].',
      variables: ['nombre'],
      firmaApollo: true,
      esManual: true,
    },
  ],
});
const idSegCopy = guardarSegmento({ nombre: 'cola-seg-copy', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['cola-cat-3'] }] } }, 1);
const idCampanaCopy = crearCampana({ nombre: 'Camp copy', idCadencia: idCadenciaCopy, idSegmento: idSegCopy, modo: 'batch' });
inscribirCampana(idCampanaCopy);
const idInscCopy = historialInscripciones('e-cola-3').find((i) => i.estado === 'activa')!.id;
const idDestCopy = destinatariosDeInscripcion(idInscCopy)[0].id;
const { idPaso: idPasoCopy, idVersion: idVersionCopy } = idsDePaso(idCadenciaCopy, 1);
const idPICopy = crearPasoInscripcionPendiente({ idDestinatario: idDestCopy, idPaso: idPasoCopy, idVersion: idVersionCopy, canal: 'correo' });

test('agendaHoyCadencias trae cuerpo, variables, firma, dia y modo de la campana', () => {
  fijarFechaProgramada(idPICopy, '2026-07-06T09:00:00.000Z');
  const agenda = agendaHoyCadencias('2026-07-06');
  const fila = agenda.find((f) => f.idPasoInscripcion === idPICopy);
  assert.ok(fila);
  assert.equal(fila!.cuerpo, 'Cuerpo [nombre].');
  assert.deepEqual(fila!.variables, ['nombre']);
  assert.equal(fila!.firmaApollo, true);
  assert.equal(fila!.orden, 1);
  assert.equal(fila!.diaOffset, 0);
  assert.equal(fila!.modo, 'batch');
  assert.equal(fila!.idDestinatario, idDestCopy);
});

// Parte 4 campanas: "que dias ya se tocaron" para un destinatario -- pasos que ya
// salieron (estado 'enviada'), sin importar canal/proveedor, ordenados por orden.
seedEmpresa('e-cola-4', 'cola-cat-4', 'historial@empresa.com');
const idCadenciaHist = crearCadencia({
  nombre: 'C historial',
  pasos: [
    { orden: 1, diaOffset: 0, canal: 'correo', cuerpo: 'p1' },
    { orden: 2, diaOffset: 3, canal: 'whatsapp', cuerpo: 'p2', esManual: true },
    { orden: 3, diaOffset: 7, canal: 'correo', cuerpo: 'p3', esManual: true },
  ],
});
const idSegHist = guardarSegmento({ nombre: 'cola-seg-hist', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['cola-cat-4'] }] } }, 1);
const idCampanaHist = crearCampana({ nombre: 'Camp hist', idCadencia: idCadenciaHist, idSegmento: idSegHist });
inscribirCampana(idCampanaHist);
const idInscHist = historialInscripciones('e-cola-4').find((i) => i.estado === 'activa')!.id;
const idDestHist = destinatariosDeInscripcion(idInscHist)[0].id;
const p1 = idsDePaso(idCadenciaHist, 1);
const p2 = idsDePaso(idCadenciaHist, 2);
const p3 = idsDePaso(idCadenciaHist, 3);
const idPIHist1 = crearPasoInscripcionPendiente({ idDestinatario: idDestHist, idPaso: p1.idPaso, idVersion: p1.idVersion, canal: 'correo' });
const idPIHist2 = crearPasoInscripcionPendiente({ idDestinatario: idDestHist, idPaso: p2.idPaso, idVersion: p2.idVersion, canal: 'whatsapp' });
crearPasoInscripcionPendiente({ idDestinatario: idDestHist, idPaso: p3.idPaso, idVersion: p3.idVersion, canal: 'correo' });

test('historialPasosDestinatario trae solo los pasos YA enviados, ordenados por orden', () => {
  marcarPasoInscripcionEnviada(idPIHist1, 'apollo', 'msg-h1', '2026-07-01T10:00:00.000Z');
  marcarPasoInscripcionEnviada(idPIHist2, 'apollo', 'msg-h2', '2026-07-04T11:00:00.000Z');

  const hist = historialPasosDestinatario(idDestHist);
  assert.deepEqual(hist.map((h) => h.orden), [1, 2]);
  assert.equal(hist[0].fechaEnviada, '2026-07-01T10:00:00.000Z');
  assert.equal(hist[1].diaOffset, 3);
  assert.ok(!hist.some((h) => h.orden === 3), 'el pendiente (paso 3) no aparece en el historial');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
