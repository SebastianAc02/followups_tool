// Guardar el copy sin mandarlo, y que la hora programada mande de verdad (2026-07-26).
// Hasta hoy un paso de cadencia era mandar o nada: el texto personalizado solo existia como
// parametro de aprobarPasoManual (o sea, solo nacia en el mismo acto de darlo por enviado), y
// pasoInscripcionesPendientes no miraba fecha_programada, asi que "programado" solo podia
// significar un dia, nunca una hora.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const {
  crearCadencia,
  guardarSegmento,
  crearCampana,
  inscribirCampana,
  historialInscripciones,
  destinatariosDeInscripcion,
  crearPasoInscripcionPendiente,
  pasoInscripcionesPendientes,
  guardarCopyPaso,
  copyDePaso,
  aprobarPasoManual,
  agendaHoyCadencias,
} = await import('./repository.ts');

function raw() {
  return new Database(dbPath);
}

function seedEmpresa(id: string, ciudad: string) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, ciudad_principal, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', ?, 1)`,
  ).run(id, id, id, ciudad);
  db.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, email, telefono, fuente)
     VALUES (?, 'Contacto', 0, 1, ?, '573000000001', 'seed')`,
  ).run(id, `${id}@empresa.com`);
  db.close();
}

function idsPasoYVersion(idCadencia: number) {
  const db = raw();
  const paso = db.prepare('SELECT id_paso FROM paso_cadencia WHERE id_cadencia = ?').get(idCadencia) as { id_paso: number };
  const version = db.prepare('SELECT id_version FROM version_paso WHERE id_paso = ?').get(paso.id_paso) as { id_version: number };
  db.close();
  return { idPaso: paso.id_paso, idVersion: version.id_version };
}

function idDestinatarioDe(idEmpresa: string): number {
  const h = historialInscripciones(idEmpresa).find((i) => i.estado === 'activa')!;
  return destinatariosDeInscripcion(h.id)[0].id;
}

seedEmpresa('e-copy-1', 'copy-cat-1');

const idCadencia = crearCadencia({
  nombre: 'C copy',
  pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', asunto: 'Hola', cuerpo: 'Plantilla generica' }],
});
const idSegmento = guardarSegmento(
  { nombre: 'copy-seg', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['copy-cat-1'] }] } },
  1,
);
const { idPaso, idVersion } = idsPasoYVersion(idCadencia);
const idCampana = crearCampana({ nombre: 'Camp copy', idCadencia, idSegmento }, 1);
{
  const db = raw();
  db.prepare('UPDATE campana SET proveedor_campana_id = ? WHERE id_campana = ?').run('seq-copy', idCampana);
  db.close();
}
inscribirCampana(idCampana, 1);

const idPasoIns = crearPasoInscripcionPendiente({
  idDestinatario: idDestinatarioDe('e-copy-1'),
  idPaso,
  idVersion,
  canal: 'correo',
  fechaProgramada: '2026-07-27T09:00:00.000Z',
});

test('sin revisar, el copy que saldria es la plantilla', () => {
  const c = copyDePaso(idPasoIns);
  assert.equal(c?.cuerpo, 'Plantilla generica');
  assert.equal(c?.revisado, false);
});

test('guardar el copy no lo manda: la fila sigue pendiente y sin fecha de envio', () => {
  assert.equal(guardarCopyPaso(idPasoIns, 'Hola Andres, vi que Fibra Uno cobra por PSE'), true);

  const db = raw();
  const f = db
    .prepare('SELECT estado, fecha_enviada, cuerpo_final FROM paso_inscripcion WHERE id_paso_inscripcion = ?')
    .get(idPasoIns) as { estado: string; fecha_enviada: string | null; cuerpo_final: string };
  db.close();

  assert.equal(f.estado, 'pendiente');
  assert.equal(f.fecha_enviada, null);
  assert.equal(f.cuerpo_final, 'Hola Andres, vi que Fibra Uno cobra por PSE');
  assert.equal(copyDePaso(idPasoIns)?.revisado, true);
});

// La plantilla no se toca: es compartida por todos los destinatarios del paso, y editarla
// reescribiria el copy de los que ya salieron.
test('guardar el copy de un envio no reescribe la plantilla del paso', () => {
  const db = raw();
  const v = db.prepare('SELECT cuerpo FROM version_paso WHERE id_version = ?').get(idVersion) as { cuerpo: string };
  db.close();
  assert.equal(v.cuerpo, 'Plantilla generica');
});

test('el push manda el copy revisado, no la plantilla', () => {
  const fila = pasoInscripcionesPendientes('correo', '2026-07-27T10:00:00.000Z').find((f) => f.idPasoInscripcion === idPasoIns);
  assert.equal(fila?.paso.cuerpo, 'Hola Andres, vi que Fibra Uno cobra por PSE');
});

// La hora, no el dia. Es lo que faltaba para poder decir "sale el lunes a las 9" en vez de
// "sale el lunes cuando el worker pase".
test('antes de la hora programada el paso no sale; despues si', () => {
  assert.equal(guardarCopyPaso(idPasoIns, 'Hola Andres, vi que Fibra Uno cobra por PSE', '2026-07-27T14:00:00.000Z'), true);

  const antes = pasoInscripcionesPendientes('correo', '2026-07-27T13:59:00.000Z');
  assert.ok(!antes.some((f) => f.idPasoInscripcion === idPasoIns), 'a las 13:59 todavia no');

  const despues = pasoInscripcionesPendientes('correo', '2026-07-27T14:00:01.000Z');
  assert.ok(despues.some((f) => f.idPasoInscripcion === idPasoIns), 'pasadas las 14:00 si');
});

// Comportamiento de siempre para las filas que nadie programo a una hora: un dia suelto es
// prefijo del ISO completo, asi que un paso de hoy sigue saliendo hoy.
test('una fila programada con dia suelto sigue saliendo ese dia', () => {
  const db = raw();
  db.prepare('UPDATE paso_inscripcion SET fecha_programada = ? WHERE id_paso_inscripcion = ?').run('2026-07-27', idPasoIns);
  db.close();

  const salen = pasoInscripcionesPendientes('correo', '2026-07-27T06:00:00.000Z');
  assert.ok(salen.some((f) => f.idPasoInscripcion === idPasoIns));
});

test('la agenda del dia muestra la plantilla y el copy revisado por separado', () => {
  const fila = agendaHoyCadencias('2026-07-27').find((f) => f.idPasoInscripcion === idPasoIns);
  assert.equal(fila?.cuerpo, 'Plantilla generica');
  assert.equal(fila?.cuerpoFinal, 'Hola Andres, vi que Fibra Uno cobra por PSE');
});

// Antes de la columna, el unico texto posible en el toque era el que llegara por parametro:
// aprobar sin pasarlo dejaba el historial de la cuenta sin lo que se dijo.
test('aprobar sin pasar texto deja en el toque el copy que se habia guardado', () => {
  aprobarPasoManual(idPasoIns, '2026-07-27T14:05:00.000Z');

  const db = raw();
  const t = db.prepare(`SELECT que_paso FROM toque WHERE id_empresa='e-copy-1' ORDER BY id_toque DESC`).get() as { que_paso: string };
  db.close();
  assert.equal(t.que_paso, 'Hola Andres, vi que Fibra Uno cobra por PSE');
});

// Reescribir el copy de algo que ya salio seria falsificar el registro de lo que se dijo.
test('un paso ya enviado no acepta copy nuevo', () => {
  assert.equal(guardarCopyPaso(idPasoIns, 'intento tardio'), false);
  assert.equal(copyDePaso(idPasoIns)?.cuerpo, 'Hola Andres, vi que Fibra Uno cobra por PSE');
});

test('guardarCopyPaso sobre un paso que no existe devuelve false, no truena', () => {
  assert.equal(guardarCopyPaso(999999, 'x'), false);
  assert.equal(copyDePaso(999999), null);
});
