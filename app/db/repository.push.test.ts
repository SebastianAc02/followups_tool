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
  datosEnvioPasoManual,
  registrarPasoEnviadoConToque,
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
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, ciudad_principal)
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
const idSegmento1 = guardarSegmento({ nombre: 'push-seg-1', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['push-cat-1'] }] } }, 1);
const idSegmento2 = guardarSegmento({ nombre: 'push-seg-2', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['push-cat-2'] }] } }, 1);
const { idPaso, idVersion } = idsPasoYVersion(idCadencia);

const idCampanaConSecuencia = crearCampana({ nombre: 'Camp con secuencia', idCadencia, idSegmento: idSegmento1 }, 1);
fijarProveedorCampanaId(idCampanaConSecuencia, 'seq-real-1');
inscribirCampana(idCampanaConSecuencia, 1);

const idCampanaSinSecuencia = crearCampana({ nombre: 'Camp sin secuencia', idCadencia, idSegmento: idSegmento2 }, 1);
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

// Sesion 2026-07-10 (revisar-y-mandar de verdad desde el cockpit): la server action
// necesita, para UN paso, el canal + destinatario (con empresa/cargo para personalizar);
// y, cuando el adaptador ya mando, marcar enviada con el proveedor REAL + dejar toque.
// Empresa/cadencia dedicada (paso whatsapp) para no colisionar con el paso 'correo'
// idempotente que los tests de arriba ya crearon para e-push-1.
seedEmpresa('e-envio-wa', 'wa@empresa.com', 'envio-wa-cat', 'Gerente Comercial');
const idCadWa = crearCadencia({ nombre: 'C wa', pasos: [{ orden: 1, diaOffset: 0, canal: 'whatsapp', cuerpo: 'Hola [nombre]' }] });
const idSegWa = guardarSegmento({ nombre: 'envio-wa-seg', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['envio-wa-cat'] }] } }, 1);
const idCampWa = crearCampana({ nombre: 'Camp wa', idCadencia: idCadWa, idSegmento: idSegWa }, 1);
fijarProveedorCampanaId(idCampWa, 'seq-wa');
inscribirCampana(idCampWa, 1);
const { idPaso: idPasoWa, idVersion: idVersionWa } = idsPasoYVersion(idCadWa);

test('datosEnvioPasoManual trae canal + destinatario completo de un solo paso (sin filtrar por esManual/estado)', () => {
  const idDestinatario = idDestinatarioDe('e-envio-wa');
  const id = crearPasoInscripcionPendiente({ idDestinatario, idPaso: idPasoWa, idVersion: idVersionWa, canal: 'whatsapp' });

  const datos = datosEnvioPasoManual(id);
  assert.ok(datos);
  assert.strictEqual(datos!.canal, 'whatsapp');
  assert.strictEqual(datos!.destinatario.email, 'wa@empresa.com');
  assert.strictEqual(datos!.destinatario.empresa, 'e-envio-wa');
  assert.strictEqual(datos!.destinatario.cargo, 'Gerente Comercial');
  assert.strictEqual(datos!.idEmpresa, 'e-envio-wa');
});

test('registrarPasoEnviadoConToque marca enviada con el proveedor real y deja un toque en el historial', () => {
  const idDestinatario = idDestinatarioDe('e-envio-wa');
  const id = crearPasoInscripcionPendiente({ idDestinatario, idPaso: idPasoWa, idVersion: idVersionWa, canal: 'whatsapp' });

  registrarPasoEnviadoConToque(id, 'evolution', 'wamid-real-1', '2026-07-10T15:00:00.000Z', 'Hola Ana, mensaje real');

  const db = raw();
  const paso = db.prepare('SELECT estado, proveedor, proveedor_mensaje_id FROM paso_inscripcion WHERE id_paso_inscripcion = ?').get(id) as any;
  const toque = db.prepare("SELECT canal, que_paso, fuente FROM toque WHERE id_empresa = 'e-envio-wa' ORDER BY id_toque DESC").get() as any;
  db.close();

  assert.strictEqual(paso.estado, 'enviada');
  assert.strictEqual(paso.proveedor, 'evolution');
  assert.strictEqual(paso.proveedor_mensaje_id, 'wamid-real-1');
  assert.strictEqual(toque.canal, 'whatsapp');
  assert.strictEqual(toque.que_paso, 'Hola Ana, mensaje real');
  assert.strictEqual(toque.fuente, 'cadencia_manual');
});

// Gate de canal (2026-07-14): dos campanas de whatsapp con duenos DISTINTOS, cada uno
// con su propia linea activa -- cada una debe resolver proveedorCampanaId a SU PROPIA
// linea, nunca a la del otro ni a una linea global compartida.
test('pasoInscripcionesPendientes: whatsapp rutea por la linea PROPIA del dueno de cada campana', () => {
  const db1 = raw();
  db1.prepare(`INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display, id_user) VALUES (1, 'Owner Uno', 'Owner Uno', 'user-owner-1')`).run();
  db1.prepare(`INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display, id_user) VALUES (1, 'Owner Dos', 'Owner Dos', 'user-owner-2')`).run();
  db1.prepare(`INSERT INTO linea_whatsapp (numero, tipo, id_usuario, referencia_proveedor, estado) VALUES ('573000000010', 'personal', 'user-owner-1', 'linea-owner-1', 'activa')`).run();
  db1.prepare(`INSERT INTO linea_whatsapp (numero, tipo, id_usuario, referencia_proveedor, estado) VALUES ('573000000011', 'personal', 'user-owner-2', 'linea-owner-2', 'activa')`).run();
  db1.close();

  seedEmpresa('e-owner-a', 'a@empresa.com', 'owner-cat-a');
  seedEmpresa('e-owner-b', 'b@empresa.com', 'owner-cat-b');

  const idCadOwners = crearCadencia({ nombre: 'C owners', pasos: [{ orden: 1, diaOffset: 0, canal: 'whatsapp', cuerpo: 'hola' }] });
  const idSegA = guardarSegmento({ nombre: 'owner-seg-a', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['owner-cat-a'] }] } }, 1);
  const idSegB = guardarSegmento({ nombre: 'owner-seg-b', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['owner-cat-b'] }] } }, 1);

  const idCampA = crearCampana({ nombre: 'Camp Owner Uno', idCadencia: idCadOwners, idSegmento: idSegA, owner: 'Owner Uno' }, 1);
  inscribirCampana(idCampA, 1);
  const idCampB = crearCampana({ nombre: 'Camp Owner Dos', idCadencia: idCadOwners, idSegmento: idSegB, owner: 'Owner Dos' }, 1);
  inscribirCampana(idCampB, 1);

  const { idPaso: idPasoOwners, idVersion: idVersionOwners } = idsPasoYVersion(idCadOwners);
  const idDestA = idDestinatarioDe('e-owner-a');
  const idDestB = idDestinatarioDe('e-owner-b');
  const idPasoInsA = crearPasoInscripcionPendiente({ idDestinatario: idDestA, idPaso: idPasoOwners, idVersion: idVersionOwners, canal: 'whatsapp' });
  const idPasoInsB = crearPasoInscripcionPendiente({ idDestinatario: idDestB, idPaso: idPasoOwners, idVersion: idVersionOwners, canal: 'whatsapp' });

  const pendientes = pasoInscripcionesPendientes('whatsapp');
  const filaA = pendientes.find((f) => f.idPasoInscripcion === idPasoInsA);
  const filaB = pendientes.find((f) => f.idPasoInscripcion === idPasoInsB);

  assert.ok(filaA, 'la fila del dueno Uno aparece en pendientes');
  assert.ok(filaB, 'la fila del dueno Dos aparece en pendientes');
  assert.strictEqual(filaA!.proveedorCampanaId, 'linea-owner-1');
  assert.strictEqual(filaB!.proveedorCampanaId, 'linea-owner-2');
});

// Dueno sin linea propia activa: su campana se salta entera (no gasta un intento
// fallido), las de otros duenos con linea si aparecen -- confirma que el filtro es
// POR CAMPANA, no un gate global como antes.
test('pasoInscripcionesPendientes: campana cuyo dueno NO tiene linea activa se salta entera', () => {
  const db1 = raw();
  db1.prepare(`INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display, id_user) VALUES (1, 'Owner Sin Linea', 'Owner Sin Linea', 'user-owner-sin-linea')`).run();
  db1.close();

  seedEmpresa('e-sin-linea', 'sinlinea@empresa.com', 'owner-cat-sin-linea');
  const idCadSinLinea = crearCadencia({ nombre: 'C sin linea', pasos: [{ orden: 1, diaOffset: 0, canal: 'whatsapp', cuerpo: 'hola' }] });
  const idSegSinLinea = guardarSegmento({ nombre: 'owner-seg-sin-linea', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: ['owner-cat-sin-linea'] }] } }, 1);
  const idCampSinLinea = crearCampana({ nombre: 'Camp sin linea', idCadencia: idCadSinLinea, idSegmento: idSegSinLinea, owner: 'Owner Sin Linea' }, 1);
  inscribirCampana(idCampSinLinea, 1);

  const { idPaso: idPasoSinLinea, idVersion: idVersionSinLinea } = idsPasoYVersion(idCadSinLinea);
  const idDestSinLinea = idDestinatarioDe('e-sin-linea');
  const idPasoInsSinLinea = crearPasoInscripcionPendiente({ idDestinatario: idDestSinLinea, idPaso: idPasoSinLinea, idVersion: idVersionSinLinea, canal: 'whatsapp' });

  const pendientes = pasoInscripcionesPendientes('whatsapp');
  assert.ok(!pendientes.some((f) => f.idPasoInscripcion === idPasoInsSinLinea), 'sin linea propia activa, la campana no aparece');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
