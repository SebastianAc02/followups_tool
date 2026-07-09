// V5.4: pruebas de Repository para el push reanudable (B6). Cubre lo que
// core/push.test.ts no puede probar con deps falsos: el indice unico real
// (crearPasoInscripcionPendiente es idempotente), el join real de
// pasoInscripcionesPendientes, y el filtro real de backoff/campana-sin-provisionar.

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
  pasoInscripcionesPendientes,
  marcarPasoInscripcionEnviada,
  marcarPasoInscripcionFallo,
  agregarPasoCadencia,
} = await import('./repository.ts');

function raw() {
  return new Database(dbPath);
}

// categoria distinta por empresa: cada segmento de prueba filtra por categoria para
// que las dos campanas NUNCA compartan destinatario (si compartieran, la regla real
// "una activa por empresa" sacaria a la empresa de la primera campana al inscribirse
// en la segunda -- found live debugging this test the hard way).
function seedEmpresa(id: string, email: string, categoria: string) {
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

function fijarProveedorCampanaId(idCampana: number, proveedorCampanaId: string | null) {
  const db = raw();
  db.prepare('UPDATE campana SET proveedor_campana_id = ? WHERE id_campana = ?').run(proveedorCampanaId, idCampana);
  db.close();
}

function idsPasoYVersion(idCadencia: number): { idPaso: number; idVersion: number } {
  const db = raw();
  const paso = db.prepare('SELECT id_paso FROM paso_cadencia WHERE id_cadencia = ?').get(idCadencia) as any;
  const version = db.prepare('SELECT id_version FROM version_paso WHERE id_paso = ?').get(paso.id_paso) as any;
  db.close();
  return { idPaso: paso.id_paso, idVersion: version.id_version };
}

seedEmpresa('e-push-1', 'ana@empresa.com', 'push-cat-1');
seedEmpresa('e-push-2', 'sin-secuencia@empresa.com', 'push-cat-2');

const idCadencia = crearCadencia({ nombre: 'C push', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', asunto: 'Hola', cuerpo: 'cuerpo' }] });
const idSegmento1 = guardarSegmento({ nombre: 'push-seg-1', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['push-cat-1'] }] } });
const idSegmento2 = guardarSegmento({ nombre: 'push-seg-2', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['push-cat-2'] }] } });
const { idPaso, idVersion } = idsPasoYVersion(idCadencia);

const idCampanaConSecuencia = crearCampana({ nombre: 'Camp con secuencia', idCadencia, idSegmento: idSegmento1 }, 1);
fijarProveedorCampanaId(idCampanaConSecuencia, 'seq-real-1');
inscribirCampana(idCampanaConSecuencia);

const idCampanaSinSecuencia = crearCampana({ nombre: 'Camp sin secuencia', idCadencia, idSegmento: idSegmento2 }, 1);
inscribirCampana(idCampanaSinSecuencia);

function idDestinatarioDe(idEmpresa: string): number {
  const h = historialInscripciones(idEmpresa).find((i) => i.estado === 'activa')!;
  return destinatariosDeInscripcion(h.id)[0].id;
}

test('crearPasoInscripcionPendiente es idempotente: correr dos veces devuelve la MISMA fila', () => {
  const idDestinatario = idDestinatarioDe('e-push-1');
  const id1 = crearPasoInscripcionPendiente({ idDestinatario, idPaso, idVersion, canal: 'correo' });
  const id2 = crearPasoInscripcionPendiente({ idDestinatario, idPaso, idVersion, canal: 'correo' });

  assert.strictEqual(id1, id2);

  const db = raw();
  const total = db.prepare('SELECT count(*) c FROM paso_inscripcion WHERE id_destinatario = ? AND id_paso = ?').get(idDestinatario, idPaso) as any;
  db.close();
  assert.strictEqual(total.c, 1);
});

test('pasoInscripcionesPendientes trae el join completo: email, nombre, asunto, cuerpo, canal, proveedorCampanaId', () => {
  const idDestinatario = idDestinatarioDe('e-push-1');
  crearPasoInscripcionPendiente({ idDestinatario, idPaso, idVersion, canal: 'correo' });

  const pendientes = pasoInscripcionesPendientes('correo');
  const fila = pendientes.find((f) => f.destinatario.email === 'ana@empresa.com');

  assert.ok(fila);
  assert.strictEqual(fila!.proveedorCampanaId, 'seq-real-1');
  assert.strictEqual(fila!.paso.asunto, 'Hola');
  assert.strictEqual(fila!.paso.cuerpo, 'cuerpo');
  assert.strictEqual(fila!.paso.canal, 'correo');
});

test('una campana SIN secuencia externa (proveedor_campana_id null) no aparece en pendientes', () => {
  const idDestinatario = idDestinatarioDe('e-push-2');
  crearPasoInscripcionPendiente({ idDestinatario, idPaso, idVersion, canal: 'correo' });

  const pendientes = pasoInscripcionesPendientes('correo');
  assert.ok(!pendientes.some((f) => f.destinatario.email === 'sin-secuencia@empresa.com'));
});

test('marcarPasoInscripcionEnviada saca la fila de pendientes (ya no se reintenta)', () => {
  const idDestinatario = idDestinatarioDe('e-push-1');
  const id = crearPasoInscripcionPendiente({ idDestinatario, idPaso, idVersion, canal: 'correo' });

  marcarPasoInscripcionEnviada(id, 'apollo', 'msg-1', '2026-07-06T10:00:00.000Z');

  const pendientes = pasoInscripcionesPendientes('correo');
  assert.ok(!pendientes.some((f) => f.idPasoInscripcion === id));
});

test('marcarPasoInscripcionFallo con proximo_intento futuro excluye la fila hasta que llegue esa fecha', () => {
  const idDestinatario = idDestinatarioDe('e-push-2');
  fijarProveedorCampanaId(idCampanaSinSecuencia, 'seq-real-2'); // ahora si tiene secuencia
  const id = crearPasoInscripcionPendiente({ idDestinatario, idPaso, idVersion, canal: 'correo' });

  marcarPasoInscripcionFallo(id, 1, '2026-07-06T12:00:00.000Z');

  const antes = pasoInscripcionesPendientes('correo', '2026-07-06T11:00:00.000Z');
  assert.ok(!antes.some((f) => f.idPasoInscripcion === id), 'antes de la hora de reintento, no aparece');

  const despues = pasoInscripcionesPendientes('correo', '2026-07-06T13:00:00.000Z');
  assert.ok(despues.some((f) => f.idPasoInscripcion === id), 'llegada la hora, vuelve a aparecer');
});

// Sesion 2026-07-09 (registro de proveedor por canal): pasoInscripcionesPendientes
// ahora exige el canal -- el worker la llama una vez por cada canal con proveedor
// registrado, nunca mezclado. Esta prueba fija el bug real que motivo el cambio: sin
// el filtro, una fila de whatsapp se habria colado en la corrida de 'correo'.
//
// Paso e idDestinatario NUEVOS a proposito (no reusa `idPaso`/`idVersion` del modulo):
// esos ya los tocaron y marcaron 'enviada'/'fallo' pruebas anteriores de este mismo
// archivo, y crearPasoInscripcionPendiente es idempotente por (idDestinatario, idPaso)
// -- reusarlos habria devuelto esa fila vieja en vez de crear una de verdad pendiente.
test('pasoInscripcionesPendientes solo trae filas del canal pedido', () => {
  const idPasoExtra = agregarPasoCadencia(idCadencia, { diaOffset: 1, canal: 'correo', cuerpo: 'extra' });
  const db = raw();
  const versionExtra = db.prepare('SELECT id_version FROM version_paso WHERE id_paso = ?').get(idPasoExtra) as { id_version: number };
  db.close();
  const idVersionExtra = versionExtra.id_version;
  const idDestinatario = idDestinatarioDe('e-push-1');
  const idWhatsapp = crearPasoInscripcionPendiente({
    idDestinatario,
    idPaso: idPasoExtra,
    idVersion: idVersionExtra,
    canal: 'whatsapp',
  });

  const deCorreo = pasoInscripcionesPendientes('correo');
  const deWhatsapp = pasoInscripcionesPendientes('whatsapp');

  assert.ok(!deCorreo.some((f) => f.idPasoInscripcion === idWhatsapp), 'la fila de whatsapp no aparece pidiendo correo');
  assert.ok(deWhatsapp.some((f) => f.idPasoInscripcion === idWhatsapp), 'la fila de whatsapp si aparece pidiendo whatsapp');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
