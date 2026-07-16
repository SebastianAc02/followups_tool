// "Que se mando y que paso con cada cosa" -- la pregunta que Sebastian hizo tres veces y
// que la app no sabia responder (2026-07-15). No era un hueco de captura: evento_tracking ya
// guarda los 6 tipos (enviado/abierto/clic/respondio/rebota/visto) desde el pixel propio, el
// poll de Apollo/Gmail y el webhook de Evolution. El hueco era de LECTURA: metricasHub era la
// unica funcion que tocaba esa tabla y solo miraba 2 de los 6 tipos. El resto se escribia y
// se moria ahi.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { actividadDeCampana } = await import('./repository.ts');

const raw = () => new Database(dbPath);

function seed() {
  const db = raw();
  db.exec(`
    INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, organizacion_activa_id)
      VALUES ('e1', 'nit', 'Viajes Andinos', 'viajes andinos', 'lead', 1);
    INSERT INTO contacto (id_contacto, id_empresa, nombre, email, telefono, es_principal, fuente)
      VALUES (1, 'e1', 'Sebastian', 'seb@test.co', '+573001112233', 1, 'test');
    INSERT INTO cadencia (id_cadencia, nombre, activa) VALUES (1, 'Demo', 1);
    INSERT INTO paso_cadencia (id_paso, id_cadencia, orden, canal, dia_offset) VALUES (1, 1, 1, 'correo', 0);
    INSERT INTO paso_cadencia (id_paso, id_cadencia, orden, canal, dia_offset) VALUES (2, 1, 2, 'whatsapp', 1);
    INSERT INTO segmento (id_segmento, nombre, definicion, id_organizacion) VALUES (1, 'Seg', '{"condiciones":[]}', 1);
    INSERT INTO campana (id_campana, nombre, id_cadencia, id_segmento, estado) VALUES (9, 'Demo', 1, 1, 'activa');
    INSERT INTO inscripcion (id_inscripcion, id_campana, id_empresa, estado) VALUES (1, 9, 'e1', 'activa');
    INSERT INTO destinatario (id_destinatario, id_inscripcion, id_contacto, estado) VALUES (1, 1, 1, 'activo');
    -- paso 1: correo enviado, abierto y con clic
    INSERT INTO paso_inscripcion (id_paso_inscripcion, id_destinatario, id_paso, id_version, canal, estado, fecha_enviada)
      VALUES (1, 1, 1, 1, 'correo', 'enviada', '2026-07-16T10:00:00.000Z');
    INSERT INTO evento_tracking (id_paso_inscripcion, tipo, canal, proveedor_evento_id, fecha_evento)
      VALUES (1, 'abierto', 'correo', 'ev-a', '2026-07-16T11:00:00.000Z');
    INSERT INTO evento_tracking (id_paso_inscripcion, tipo, canal, proveedor_evento_id, fecha_evento)
      VALUES (1, 'clic', 'correo', 'ev-c', '2026-07-16T11:05:00.000Z');
    -- paso 2: whatsapp enviado, sin senales todavia
    INSERT INTO paso_inscripcion (id_paso_inscripcion, id_destinatario, id_paso, id_version, canal, estado, fecha_enviada)
      VALUES (2, 1, 2, 2, 'whatsapp', 'enviada', '2026-07-17T09:00:00.000Z');
  `);
  db.close();
}
seed();

test('actividadDeCampana: una fila por envio, con las señales de cada uno', () => {
  const filas = actividadDeCampana(9);

  assert.equal(filas.length, 2, 'un envio por paso materializado');

  const correo = filas.find((f) => f.canal === 'correo')!;
  assert.equal(correo.contacto, 'Sebastian');
  assert.equal(correo.empresa, 'Viajes Andinos');
  assert.equal(correo.orden, 1);
  assert.equal(correo.estado, 'enviada');
  assert.equal(correo.abrio, true);
  assert.equal(correo.hizoClic, true);
  assert.equal(correo.respondio, false);
  assert.equal(correo.reboto, false);

  const wa = filas.find((f) => f.canal === 'whatsapp')!;
  assert.equal(wa.orden, 2);
  assert.equal(wa.abrio, false, 'sin evento todavia');
  assert.equal(wa.vioWhatsapp, false);
});

test('actividadDeCampana: ordena por paso, para leerla como una linea de tiempo', () => {
  const filas = actividadDeCampana(9);
  assert.deepEqual(filas.map((f) => f.orden), [1, 2]);
});

test('actividadDeCampana: otra campana no se cuela', () => {
  assert.deepEqual(actividadDeCampana(999), []);
});

// Un paso que todavia no sale (pendiente) tambien es informacion: "esto viene ahora".
// id_paso 3 y no 1: hay un indice unico (id_destinatario, id_paso) -- un envio por
// destinatario y paso. Reusar el paso 1 lo rechaza la DB, con razon.
test('actividadDeCampana: incluye los pasos pendientes, no solo los enviados', () => {
  const db = raw();
  db.exec(`
    INSERT INTO paso_cadencia (id_paso, id_cadencia, orden, canal, dia_offset) VALUES (3, 1, 3, 'llamada', 2);
    INSERT INTO paso_inscripcion (id_paso_inscripcion, id_destinatario, id_paso, id_version, canal, estado, fecha_programada)
      VALUES (3, 1, 3, 1, 'llamada', 'pendiente', '2026-07-18');
  `);
  db.close();

  const filas = actividadDeCampana(9);
  assert.equal(filas.length, 3);
  assert.ok(filas.some((f) => f.estado === 'pendiente'), 'lo que viene tambien se ve');
});
