// V5.5: pruebas de Repository para poll de tracking + reply detection. Cubre lo que
// core/tracking.test.ts no puede probar con deps falsos: el join real de
// resolverDestinatarioPorEmail y la idempotencia real de guardarEventoTracking
// contra el indice unico de evento_tracking (V5.1).

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
  campanasConSecuencia,
  resolverDestinatarioPorEmail,
  guardarEventoTracking,
  pausarInscripcion,
  marcarDestinatarioSalio,
  quedanDestinatariosActivos,
} = await import('./repository.ts');

function raw() {
  return new Database(dbPath);
}

function seedEmpresa(id: string, categoria: string, contactos: { email: string; principal?: boolean }[]) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, categoria)
     VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', ?)`,
  ).run(id, id, id.toLowerCase(), categoria);
  for (const c of contactos) {
    db.prepare(
      `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, email, fuente) VALUES (?, 'Contacto', 0, ?, ?, 'seed')`,
    ).run(id, c.principal ? 1 : 0, c.email);
  }
  db.close();
}

function fijarProveedorCampanaId(idCampana: number, id: string) {
  const db = raw();
  db.prepare('UPDATE campana SET proveedor_campana_id = ? WHERE id_campana = ?').run(id, idCampana);
  db.close();
}

function idsPasoYVersion(idCadencia: number) {
  const db = raw();
  const paso = db.prepare('SELECT id_paso FROM paso_cadencia WHERE id_cadencia = ?').get(idCadencia) as any;
  const version = db.prepare('SELECT id_version FROM version_paso WHERE id_paso = ?').get(paso.id_paso) as any;
  db.close();
  return { idPaso: paso.id_paso, idVersion: version.id_version };
}

seedEmpresa('e-track-1', 'track-cat-1', [{ email: 'ana@empresa.com', principal: true }]);

const idCadencia = crearCadencia({ nombre: 'C track', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', asunto: 'Hola', cuerpo: 'x' }] });
const idSegmento = guardarSegmento({ nombre: 'track-seg', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['track-cat-1'] }] } });
const { idPaso, idVersion } = idsPasoYVersion(idCadencia);

const idCampana = crearCampana({ nombre: 'Camp track', idCadencia, idSegmento });
fijarProveedorCampanaId(idCampana, 'seq-track-1');
inscribirCampana(idCampana);

const hist = historialInscripciones('e-track-1').find((i) => i.estado === 'activa')!;
const idInscripcion = hist.id;
const idDestinatario = destinatariosDeInscripcion(idInscripcion)[0].id;
const idPasoInscripcion = crearPasoInscripcionPendiente({ idDestinatario, idPaso, idVersion, canal: 'correo' });
marcarPasoInscripcionEnviada(idPasoInscripcion, 'apollo', 'contacto-apollo-1', '2026-07-06T10:00:00.000Z');

test('campanasConSecuencia devuelve solo campanas con proveedor_campana_id', () => {
  const camps = campanasConSecuencia();
  assert.ok(camps.some((c) => c.proveedorCampanaId === 'seq-track-1'));
});

test('resolverDestinatarioPorEmail encuentra el destinatario por (proveedorCampanaId, email)', () => {
  const resuelto = resolverDestinatarioPorEmail('seq-track-1', 'ana@empresa.com');
  assert.ok(resuelto);
  assert.strictEqual(resuelto!.idDestinatario, idDestinatario);
  assert.strictEqual(resuelto!.idInscripcion, idInscripcion);
  assert.strictEqual(resuelto!.idPasoInscripcion, idPasoInscripcion);
});

test('resolverDestinatarioPorEmail con email desconocido devuelve null', () => {
  assert.strictEqual(resolverDestinatarioPorEmail('seq-track-1', 'nadie@x.com'), null);
});

test('guardarEventoTracking es idempotente: el mismo proveedor_evento_id no se duplica', () => {
  const evento = { proveedorEventoId: 'evt-real-1', tipo: 'abierto', canal: 'correo', fechaEvento: '2026-07-06T11:00:00.000Z', email: 'ana@empresa.com', detalle: {} };
  const r1 = guardarEventoTracking(idPasoInscripcion, evento);
  const r2 = guardarEventoTracking(idPasoInscripcion, evento);

  assert.strictEqual(r1, 'insertado');
  assert.strictEqual(r2, 'duplicado');

  const db = raw();
  const total = db.prepare('SELECT count(*) c FROM evento_tracking WHERE proveedor_evento_id = ?').get('evt-real-1') as any;
  db.close();
  assert.strictEqual(total.c, 1);
});

test('pausarInscripcion cambia el estado a pausada con motivo visible', () => {
  pausarInscripcion(idInscripcion, 'respuesta detectada');
  const h = historialInscripciones('e-track-1').find((i) => i.id === idInscripcion)!;
  assert.strictEqual(h.estado, 'pausada');
  assert.strictEqual(h.motivoFin, 'respuesta detectada');
});

test('marcarDestinatarioSalio + quedanDestinatariosActivos refleja el cambio real', () => {
  assert.strictEqual(quedanDestinatariosActivos(idInscripcion), true);
  marcarDestinatarioSalio(idDestinatario);
  assert.strictEqual(quedanDestinatariosActivos(idInscripcion), false);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
