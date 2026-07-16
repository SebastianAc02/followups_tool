// resumenTrackingPorEmpresa: conteo de aperturas/clics + ultima hora + visto de WhatsApp,
// agregado por empresa, para el pill de /cola. Lee evento_tracking (ya poblado por el pixel
// y el acuse de WhatsApp) cruzando hasta inscripcion.id_empresa.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { crearCadencia, guardarSegmento, crearCampana, inscribirCampana, resumenTrackingPorEmpresa } =
  await import('./repository.ts');

function seed() {
  const raw = new Database(dbPath);
  raw.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, categoria, ciudad_principal)
     VALUES ('e1', 'nit', 'Uno', 'uno', 'activo', 'on_hold', 'isp', 'Cali')`,
  ).run();
  raw.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, email, fuente)
     VALUES ('e1', 'Ppal', 0, 1, 'p@x.com', 'seed')`,
  ).run();
  raw.close();
}
seed();

const idCadencia = crearCadencia({ nombre: 'C', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', cuerpo: 'x' }] });
const idSegmento = guardarSegmento({ nombre: 's', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['Cali'] }] } }, 1);
const idCampana = crearCampana({ nombre: 'Camp', idCadencia, idSegmento }, 1);
inscribirCampana(idCampana, 1);

// Indice unico (id_destinatario, id_paso): un solo envio posible para ese par, asi que
// la funcion es idempotente -- reusa la fila si ya existe (los tests cuelgan eventos
// distintos del MISMO envio, no envios distintos).
function idPasoDeE1(): number {
  const raw = new Database(dbPath);
  const dest = raw.prepare(
    `SELECT d.id_destinatario AS id FROM destinatario d
       JOIN inscripcion i ON i.id_inscripcion = d.id_inscripcion
      WHERE i.id_empresa = 'e1'`,
  ).get() as any;
  const paso = raw.prepare(`SELECT id_paso FROM paso_cadencia WHERE id_cadencia = ?`).get(idCadencia) as any;
  const existente = raw
    .prepare(`SELECT id_paso_inscripcion AS id FROM paso_inscripcion WHERE id_destinatario = ? AND id_paso = ?`)
    .get(dest.id, paso.id_paso) as any;
  if (existente) {
    raw.close();
    return existente.id;
  }
  const r = raw.prepare(
    `INSERT INTO paso_inscripcion (id_destinatario, id_paso, id_version, canal, estado, created_at)
     VALUES (?, ?, 1, 'correo', 'enviada', '2026-07-15T00:00:00.000Z')`,
  ).run(dest.id, paso.id_paso);
  raw.close();
  return Number(r.lastInsertRowid);
}

function insertarEvento(idPaso: number, tipo: string, fecha: string) {
  const raw = new Database(dbPath);
  raw.prepare(
    `INSERT INTO evento_tracking (id_paso_inscripcion, tipo, canal, proveedor_evento_id, fecha_evento, created_at)
     VALUES (?, ?, 'correo', ?, ?, ?)`,
  ).run(idPaso, tipo, `${tipo}:${idPaso}:${fecha}`, fecha, fecha);
  raw.close();
}

test('cuenta aperturas y clics, y guarda la ultima apertura', () => {
  const idPaso = idPasoDeE1();
  insertarEvento(idPaso, 'abierto', '2026-07-15T10:00:00.000Z');
  insertarEvento(idPaso, 'abierto', '2026-07-15T14:00:00.000Z');
  insertarEvento(idPaso, 'clic', '2026-07-15T14:05:00.000Z');

  const mapa = resumenTrackingPorEmpresa(['e1']);
  const r = mapa.get('e1');
  assert.ok(r, 'e1 debe estar en el mapa');
  assert.equal(r.aperturas, 2);
  assert.equal(r.clics, 1);
  assert.equal(r.ultimaApertura, '2026-07-15T14:00:00.000Z');
  assert.equal(r.vioWhatsapp, false);
});

test('marca vioWhatsapp con un evento visto', () => {
  const idPaso = idPasoDeE1();
  insertarEvento(idPaso, 'visto', '2026-07-15T09:00:00.000Z');
  const r = resumenTrackingPorEmpresa(['e1']).get('e1');
  assert.equal(r?.vioWhatsapp, true);
});

test('una empresa sin eventos no aparece en el mapa', () => {
  assert.equal(resumenTrackingPorEmpresa(['e-inexistente']).has('e-inexistente'), false);
});

test('set vacio devuelve mapa vacio sin tocar la DB', () => {
  assert.equal(resumenTrackingPorEmpresa([]).size, 0);
});
