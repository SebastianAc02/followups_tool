// El materializador (V? -- ver planning/experimento-apollo.md Hallazgo real #4) es el
// puente que faltaba entre "el motor de fechas dice que ya toca" (agendaEnSeco, EN SECO)
// y una fila real de paso_inscripcion que agendaHoyCadencias pueda mostrar en /cola. Sin
// el, inscribirCampana crea inscripcion+destinatario pero nada aparece jamas en la cola.

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
  materializarPasosDebidos,
  agendaHoyCadencias,
  marcarPasoInscripcionEnviada,
} = await import('./repository.ts');

const CONFIG = { diasBloqueados: [], corrimiento: 'siguiente' as const };

function raw() {
  return new Database(dbPath);
}

function seedEmpresa(id: string, categoria: string, opts: { email?: string; telefono?: string } = {}) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, categoria)
     VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', ?)`,
  ).run(id, id, id.toLowerCase(), categoria);
  db.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, email, telefono, fuente)
     VALUES (?, 'Contacto', 0, 1, ?, ?, 'seed')`,
  ).run(id, opts.email ?? null, opts.telefono ?? null);
  db.close();
}

function fijarAnchor(idInscripcion: number, fechaIso: string) {
  const db = raw();
  db.prepare('UPDATE inscripcion SET fecha_inscripcion = ? WHERE id_inscripcion = ?').run(fechaIso, idInscripcion);
  db.close();
}

function inscripcionActivaDe(idEmpresa: string) {
  return historialInscripciones(idEmpresa).find((i) => i.estado === 'activa')!;
}

test('primera pasada materializa el paso del dia 0 como pendiente', () => {
  seedEmpresa('e-mat-1', 'mat-cat-1', { email: 'a@x.com', telefono: '3000000001' });
  const idCadencia = crearCadencia({
    nombre: 'C mat 1',
    pasos: [
      { orden: 1, diaOffset: 0, canal: 'correo', cuerpo: 'p1' },
      { orden: 2, diaOffset: 3, canal: 'llamada', objetivo: 'seguimiento', esManual: true },
    ],
  });
  const idSeg = guardarSegmento({ nombre: 'mat-seg-1', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['mat-cat-1'] }] } }, 1);
  const idCampana = crearCampana({ nombre: 'Camp mat 1', idCadencia, idSegmento: idSeg }, 1);
  inscribirCampana(idCampana, 1);
  const insc = inscripcionActivaDe('e-mat-1');
  fijarAnchor(insc.id, '2026-07-01T00:00:00.000Z');

  const r1 = materializarPasosDebidos('2026-07-01', CONFIG);
  assert.equal(r1.creados, 1);
  assert.equal(r1.omitidos, 0);

  const agenda = agendaHoyCadencias('2026-07-01');
  assert.ok(agenda.some((f) => f.idEmpresa === 'e-mat-1' && f.canal === 'correo'));
});

test('no avanza al paso 2 hasta que el paso 1 este ejecutado (enviada), y no duplica en corridas repetidas', () => {
  seedEmpresa('e-mat-2', 'mat-cat-2', { email: 'b@x.com', telefono: '3000000002' });
  const idCadencia = crearCadencia({
    nombre: 'C mat 2',
    pasos: [
      { orden: 1, diaOffset: 0, canal: 'correo', cuerpo: 'p1' },
      { orden: 2, diaOffset: 3, canal: 'llamada', objetivo: 'seguimiento', esManual: true },
    ],
  });
  const idSeg = guardarSegmento({ nombre: 'mat-seg-2', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['mat-cat-2'] }] } }, 1);
  const idCampana = crearCampana({ nombre: 'Camp mat 2', idCadencia, idSegmento: idSeg }, 1);
  inscribirCampana(idCampana, 1);
  const insc = inscripcionActivaDe('e-mat-2');
  fijarAnchor(insc.id, '2026-07-01T00:00:00.000Z');

  materializarPasosDebidos('2026-07-01', CONFIG);
  const r2 = materializarPasosDebidos('2026-07-01', CONFIG);
  assert.equal(r2.creados, 0, 'correr el mismo dia otra vez no crea una segunda fila');

  const rDia4Antes = materializarPasosDebidos('2026-07-04', CONFIG);
  assert.equal(rDia4Antes.creados, 0, 'el paso 2 no toca porque el paso 1 sigue pendiente (no ejecutado)');

  const idDest = destinatariosDeInscripcion(insc.id)[0].id;
  const pi1 = agendaHoyCadencias('2026-07-01').find((f) => f.idDestinatario === idDest)!;
  marcarPasoInscripcionEnviada(pi1.idPasoInscripcion, 'apollo', 'msg-1', '2026-07-01T09:00:00.000Z');

  const rDia4Despues = materializarPasosDebidos('2026-07-04', CONFIG);
  assert.equal(rDia4Despues.creados, 1, 'con el paso 1 ya enviado, el paso 2 (llamada, dia 3) si materializa');

  const agendaDia4 = agendaHoyCadencias('2026-07-04');
  assert.ok(agendaDia4.some((f) => f.idDestinatario === idDest && f.canal === 'llamada'));
});

test('sin telefono, el paso de llamada se omite (regla cola) y no bloquea el paso de correo que sigue', () => {
  seedEmpresa('e-mat-3', 'mat-cat-3', { email: 'c@x.com' }); // sin telefono
  const idCadencia = crearCadencia({
    nombre: 'C mat 3',
    pasos: [
      { orden: 1, diaOffset: 0, canal: 'llamada', objetivo: 'primer contacto', esManual: true },
      { orden: 2, diaOffset: 1, canal: 'correo', cuerpo: 'p2' },
    ],
  });
  const idSeg = guardarSegmento({ nombre: 'mat-seg-3', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['mat-cat-3'] }] } }, 1);
  const idCampana = crearCampana({ nombre: 'Camp mat 3', idCadencia, idSegmento: idSeg, reglaFaltante: 'cola' }, 1);
  inscribirCampana(idCampana, 1);
  const insc = inscripcionActivaDe('e-mat-3');
  fijarAnchor(insc.id, '2026-07-01T00:00:00.000Z');

  const rDia0 = materializarPasosDebidos('2026-07-01', CONFIG);
  assert.equal(rDia0.omitidos, 1, 'el paso de llamada se omite de una: no hay a quien llamar');
  assert.equal(rDia0.creados, 0, 'el paso de correo (dia 1) todavia no toca');

  const rDia1 = materializarPasosDebidos('2026-07-02', CONFIG);
  assert.equal(rDia1.creados, 1, 'el correo del dia 1 si se materializa, sin esperar a que alguien resuelva la llamada omitida');

  const idDest = destinatariosDeInscripcion(insc.id)[0].id;
  const agendaDia1 = agendaHoyCadencias('2026-07-02');
  assert.ok(agendaDia1.some((f) => f.idDestinatario === idDest && f.canal === 'correo'));
  assert.ok(!agendaDia1.some((f) => f.idDestinatario === idDest && f.canal === 'llamada'), 'la llamada omitida nunca aparece en la cola');
});

test('empresa bloqueada (sin destinatario, ningun contacto con email) no revienta el barrido', () => {
  seedEmpresa('e-mat-4', 'mat-cat-4', {}); // sin email ni telefono
  const idCadencia = crearCadencia({ nombre: 'C mat 4', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', cuerpo: 'p1' }] });
  const idSeg = guardarSegmento({ nombre: 'mat-seg-4', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['mat-cat-4'] }] } }, 1);
  const idCampana = crearCampana({ nombre: 'Camp mat 4', idCadencia, idSegmento: idSeg }, 1);
  inscribirCampana(idCampana, 1);

  assert.doesNotThrow(() => materializarPasosDebidos('2026-07-01', CONFIG));
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
