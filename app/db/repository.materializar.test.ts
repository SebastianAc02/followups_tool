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
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, ciudad_principal)
     VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', ?)`,
  ).run(id, id, id.toLowerCase(), categoria);
  db.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, email, telefono, fuente)
     VALUES (?, 'Contacto', 0, 1, ?, ?, 'seed')`,
  ).run(id, opts.email ?? null, opts.telefono ?? null);
  db.close();
}

// El anchor se guarda como instante (UTC) y se lee como dia de calendario en BOGOTA, que es
// la zona en la que trabaja el motor. Los escenarios de abajo anclan a las 14:00Z = 09:00 de
// Bogota: un instante de MEDIANOCHE UTC seria las 19:00 del dia ANTERIOR en Bogota y el
// escenario diria un dia distinto del que se lee.
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
  const idSeg = guardarSegmento({ nombre: 'mat-seg-1', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['mat-cat-1'] }] } }, 1);
  const idCampana = crearCampana({ nombre: 'Camp mat 1', idCadencia, idSegmento: idSeg }, 1);
  inscribirCampana(idCampana, 1);
  const insc = inscripcionActivaDe('e-mat-1');
  fijarAnchor(insc.id, '2026-07-01T14:00:00.000Z');

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
  const idSeg = guardarSegmento({ nombre: 'mat-seg-2', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['mat-cat-2'] }] } }, 1);
  const idCampana = crearCampana({ nombre: 'Camp mat 2', idCadencia, idSegmento: idSeg }, 1);
  inscribirCampana(idCampana, 1);
  const insc = inscripcionActivaDe('e-mat-2');
  fijarAnchor(insc.id, '2026-07-01T14:00:00.000Z');

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
  const idSeg = guardarSegmento({ nombre: 'mat-seg-3', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['mat-cat-3'] }] } }, 1);
  const idCampana = crearCampana({ nombre: 'Camp mat 3', idCadencia, idSegmento: idSeg, reglaFaltante: 'cola' }, 1);
  inscribirCampana(idCampana, 1);
  const insc = inscripcionActivaDe('e-mat-3');
  fijarAnchor(insc.id, '2026-07-01T14:00:00.000Z');

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
  const idSeg = guardarSegmento({ nombre: 'mat-seg-4', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['mat-cat-4'] }] } }, 1);
  const idCampana = crearCampana({ nombre: 'Camp mat 4', idCadencia, idSegmento: idSeg }, 1);
  inscribirCampana(idCampana, 1);

  assert.doesNotThrow(() => materializarPasosDebidos('2026-07-01', CONFIG));
});

// Bug medido en produccion el 2026-07-28 a las 20:09 -05: las inscripciones 216 y 217
// quedaron con fecha_inscripcion '2026-07-29T01:09Z' (el mismo instante, escrito en UTC) y su
// paso de dia 0 NO se materializo esa noche. El anchor se leia recortando el ISO, o sea en
// dia UTC, mientras el worker pasa hoy() en dia Bogota: entre las 19:00 y la medianoche las
// dos puntas caian en dias distintos y el paso de hoy calculaba mañana.
//
// La hora simulada no necesita fake timers: 01:09Z ES las 20:09 de Bogota del dia anterior.
// Lo que se fija es justo el dato que produce ese instante en la base.
test('la inscripcion de las 20:09 hora Bogota materializa su paso de dia 0 ESE mismo dia', () => {
  seedEmpresa('e-mat-tz', 'mat-cat-tz', { email: 'tz@x.com', telefono: '3000000009' });
  const idCadencia = crearCadencia({ nombre: 'C mat tz', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', cuerpo: 'p1' }] });
  const idSeg = guardarSegmento({ nombre: 'mat-seg-tz', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['mat-cat-tz'] }] } }, 1);
  const idCampana = crearCampana({ nombre: 'Camp mat tz', idCadencia, idSegmento: idSeg }, 1);
  inscribirCampana(idCampana, 1);
  const insc = inscripcionActivaDe('e-mat-tz');
  fijarAnchor(insc.id, '2026-07-29T01:09:48.705Z'); // 2026-07-28 20:09 en Bogota

  const r = materializarPasosDebidos('2026-07-28', CONFIG);
  assert.equal(r.creados, 1, 'el paso de dia 0 toca el 28, que es el dia que era en Bogota cuando entro la empresa');

  // Contra la base abierta aparte, no contra el valor de retorno: lo que importa es la fila.
  const db = raw();
  const idDest = destinatariosDeInscripcion(insc.id)[0].id;
  const fila = db
    .prepare('SELECT estado, fecha_programada FROM paso_inscripcion WHERE id_destinatario = ?')
    .get(idDest) as { estado: string; fecha_programada: string };
  db.close();
  assert.equal(fila.estado, 'pendiente');
  assert.equal(fila.fecha_programada, '2026-07-28', 'programada para hoy en Bogota, no para mañana en UTC');
});

test('un anchor de las 20:09 no adelanta los pasos de offset mayor a cero', () => {
  seedEmpresa('e-mat-tz2', 'mat-cat-tz2', { email: 'tz2@x.com', telefono: '3000000010' });
  const idCadencia = crearCadencia({
    nombre: 'C mat tz2',
    pasos: [
      { orden: 1, diaOffset: 0, canal: 'correo', cuerpo: 'p1' },
      { orden: 2, diaOffset: 2, canal: 'correo', cuerpo: 'p2' },
    ],
  });
  const idSeg = guardarSegmento({ nombre: 'mat-seg-tz2', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['mat-cat-tz2'] }] } }, 1);
  const idCampana = crearCampana({ nombre: 'Camp mat tz2', idCadencia, idSegmento: idSeg }, 1);
  inscribirCampana(idCampana, 1);
  const insc = inscripcionActivaDe('e-mat-tz2');
  fijarAnchor(insc.id, '2026-07-29T01:09:48.705Z'); // 2026-07-28 20:09 en Bogota

  materializarPasosDebidos('2026-07-28', CONFIG);
  const idDest = destinatariosDeInscripcion(insc.id)[0].id;
  const pi1 = agendaHoyCadencias('2026-07-28').find((f) => f.idDestinatario === idDest)!;
  // Enviado tambien de noche: la fecha real del paso 1 se guarda en UTC y es la que re-ancla
  // el paso 2, asi que el corrimiento tenia por donde volver a entrar.
  marcarPasoInscripcionEnviada(pi1.idPasoInscripcion, 'apollo', 'msg-tz', '2026-07-29T01:30:00.000Z');

  assert.equal(materializarPasosDebidos('2026-07-29', CONFIG).creados, 0, 'el paso de offset 2 no toca al dia siguiente');
  assert.equal(materializarPasosDebidos('2026-07-30', CONFIG).creados, 1, 'toca dos dias despues del 28, que es cuando entro la empresa');

  const db = raw();
  const filas = db
    .prepare('SELECT fecha_programada FROM paso_inscripcion WHERE id_destinatario = ? ORDER BY id_paso_inscripcion')
    .all(idDest) as { fecha_programada: string }[];
  db.close();
  assert.deepEqual(
    filas.map((f) => f.fecha_programada),
    ['2026-07-28', '2026-07-30'],
  );
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
