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
  lineaWhatsappActiva,
} = await import('./repository.ts');

function raw() {
  return new Database(dbPath);
}

// categoria distinta por empresa: cada segmento de prueba filtra por categoria para
// que las dos campanas NUNCA compartan destinatario (si compartieran, la regla real
// "una activa por empresa" sacaria a la empresa de la primera campana al inscribirse
// en la segunda -- found live debugging this test the hard way).
function seedEmpresa(id: string, email: string, categoria: string, cargo: string | null = null) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, categoria)
     VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', ?)`,
  ).run(id, id, id.toLowerCase(), categoria);
  db.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, email, fuente, cargo) VALUES (?, 'Contacto', 0, 1, ?, 'seed', ?)`,
  ).run(id, email, cargo);
  db.close();
}

function fijarProveedorCampanaId(idCampana: number, proveedorCampanaId: string | null) {
  const db = raw();
  db.prepare('UPDATE campana SET proveedor_campana_id = ? WHERE id_campana = ?').run(proveedorCampanaId, idCampana);
  db.close();
}

function seedLineaWhatsapp(referenciaProveedor: string, estado: string) {
  const db = raw();
  db.prepare(
    `INSERT INTO linea_whatsapp (numero, tipo, referencia_proveedor, estado) VALUES (?, 'pool', ?, ?)`,
  ).run('573000000000', referenciaProveedor, estado);
  db.close();
}

function fijarEstadoLineaWhatsapp(referenciaProveedor: string, estado: string) {
  const db = raw();
  db.prepare(`UPDATE linea_whatsapp SET estado = ? WHERE referencia_proveedor = ?`).run(estado, referenciaProveedor);
  db.close();
}

function idsPasoYVersion(idCadencia: number): { idPaso: number; idVersion: number } {
  const db = raw();
  const paso = db.prepare('SELECT id_paso FROM paso_cadencia WHERE id_cadencia = ?').get(idCadencia) as any;
  const version = db.prepare('SELECT id_version FROM version_paso WHERE id_paso = ?').get(paso.id_paso) as any;
  db.close();
  return { idPaso: paso.id_paso, idVersion: version.id_version };
}

seedEmpresa('e-push-1', 'ana@empresa.com', 'push-cat-1', 'Gerente Comercial');
seedEmpresa('e-push-2', 'sin-secuencia@empresa.com', 'push-cat-2');

const idCadencia = crearCadencia({ nombre: 'C push', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', asunto: 'Hola', cuerpo: 'cuerpo' }] });
const idSegmento1 = guardarSegmento({ nombre: 'push-seg-1', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['push-cat-1'] }] } }, 1);
const idSegmento2 = guardarSegmento({ nombre: 'push-seg-2', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['push-cat-2'] }] } }, 1);
const { idPaso, idVersion } = idsPasoYVersion(idCadencia);

const idCampanaConSecuencia = crearCampana({ nombre: 'Camp con secuencia', idCadencia, idSegmento: idSegmento1 });
fijarProveedorCampanaId(idCampanaConSecuencia, 'seq-real-1');
inscribirCampana(idCampanaConSecuencia, 1);

const idCampanaSinSecuencia = crearCampana({ nombre: 'Camp sin secuencia', idCadencia, idSegmento: idSegmento2 });
inscribirCampana(idCampanaSinSecuencia, 1);

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
  assert.strictEqual(fila!.destinatario.empresa, 'e-push-1');
  assert.strictEqual(fila!.destinatario.cargo, 'Gerente Comercial');
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

// Tarea B2 (plan-prueba-real-multicanal.md): a diferencia de correo (proveedor por
// CAMPANA, un emailer_campaign_id de Apollo por campana), whatsapp manda por LINEA
// (una instalacion de Evolution, sin concepto de secuencia externa) -- por eso el
// gate es "hay una linea_whatsapp activa", no "esta campana tiene proveedor_campana_id".
test('lineaWhatsappActiva() devuelve null si no hay ninguna linea whatsapp activa', () => {
  assert.equal(lineaWhatsappActiva(), null);
});

test('lineaWhatsappActiva() devuelve la referencia de proveedor de la primera linea activa (ignora las que no estan activas)', () => {
  seedLineaWhatsapp('instancia-calentando', 'calentando');
  seedLineaWhatsapp('instancia-activa', 'activa');

  const linea = lineaWhatsappActiva();
  assert.ok(linea);
  assert.strictEqual(linea!.referenciaProveedor, 'instancia-activa');
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
//
// Decision de diseno (tarea B2): el proveedorCampanaId que push.ts recibe para un paso
// de whatsapp NO es campana.proveedor_campana_id (whatsapp no crea secuencia en Apollo
// ni en ningun otro proveedor por campana) -- es la referenciaProveedor de la
// linea_whatsapp activa, resuelta UNA vez por corrida y reusada para todas las filas.
// push.ts sigue sin saber esto: recibe el mismo campo posicional de siempre, ya
// resuelto por el Repository segun el canal.
test('pasoInscripcionesPendientes solo trae filas del canal pedido, y whatsapp resuelve el proveedor por la linea activa', () => {
  const idPasoExtra = agregarPasoCadencia(idCadencia, { diaOffset: 1, canal: 'correo', cuerpo: 'extra' });
  const db = raw();
  const versionExtra = db.prepare('SELECT id_version FROM version_paso WHERE id_paso = ?').get(idPasoExtra) as { id_version: number };
  db.close();
  const idVersionExtra = versionExtra.id_version;
  const idDestinatario = idDestinatarioDe('e-push-1');

  // La linea queda caida un instante: con el gate cerrado, un paso de whatsapp
  // pendiente NO debe salir en pasoInscripcionesPendientes('whatsapp') aunque exista.
  fijarEstadoLineaWhatsapp('instancia-activa', 'caida');
  const idWhatsapp = crearPasoInscripcionPendiente({
    idDestinatario,
    idPaso: idPasoExtra,
    idVersion: idVersionExtra,
    canal: 'whatsapp',
  });
  assert.ok(
    !pasoInscripcionesPendientes('whatsapp').some((f) => f.idPasoInscripcion === idWhatsapp),
    'sin linea activa, el paso de whatsapp no sale en pendientes (gate cerrado)',
  );
  fijarEstadoLineaWhatsapp('instancia-activa', 'activa');

  const deCorreo = pasoInscripcionesPendientes('correo');
  const deWhatsapp = pasoInscripcionesPendientes('whatsapp');

  assert.ok(!deCorreo.some((f) => f.idPasoInscripcion === idWhatsapp), 'la fila de whatsapp no aparece pidiendo correo');
  const filaWhatsapp = deWhatsapp.find((f) => f.idPasoInscripcion === idWhatsapp);
  assert.ok(filaWhatsapp, 'la fila de whatsapp si aparece pidiendo whatsapp, con la linea activa de nuevo');
  assert.strictEqual(
    filaWhatsapp!.proveedorCampanaId,
    'instancia-activa',
    'whatsapp usa la referencia de la linea activa, no proveedor_campana_id de Apollo (que esta campana ni siquiera necesita)',
  );
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
