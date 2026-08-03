// La composicion de Toques: una sola funcion arma la cola del dia y las tres superficies que
// la muestran (la pantalla /cola, el badge del nav y el contador del home) leen de ella.
//
// Por que existe (2026-08-03): las tres la componian por su cuenta y ninguna daba el mismo
// numero. El badge contaba solo colaLeads, el home sumaba leads+cierres+reagendar+cadencias y
// la pantalla sumaba eso mas contacto_iniciado con seguimiento. Con la composicion en un solo
// lugar, "62 para hoy" significa lo mismo en los tres.
//
// La regla que se prueba: entra a la cola del dia lo que tiene fecha vencida o de hoy, es del
// owner, y su estado_notion admite toque (on_hold y firma_pago NUNCA, por ninguna puerta,
// incluida la de las cadencias, que es por donde se estaban colando 43 on_hold el 2026-08-03).
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { cargarColaDeHoy } = await import('./hoy.ts');

const OWNER = 'Sebastian Acosta Molina'; // OWNER_COLA_SPLIT
const OTRO_OWNER = 'Felipe Castro';
const HOY = '2026-08-03';
const ORG = 1;

function raw() {
  return new Database(dbPath);
}
function ultimoId(db: Database.Database): number {
  return (db.prepare(`SELECT last_insert_rowid() id`).get() as { id: number }).id;
}

function seedEmpresa(id: string, owner: string, estado: string | null, fecha: string | null) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, estado_notion, proximo_follow_up_fecha, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'activo', ?, ?, ?, ?)`,
  ).run(id, id, id, owner, estado, fecha, ORG);
  db.close();
}

// Un paso de cadencia pendiente y ya vencido para esa empresa: la puerta por la que se colaban
// las on_hold. modo 'batch' + es_manual = la caja de aprobacion de copys, que va aparte.
function seedPasoVencido(idEmpresa: string, opciones: { modo?: string; esManual?: number; fecha?: string } = {}) {
  const { modo = 'individual', esManual = 1, fecha = '2026-07-28' } = opciones;
  const db = raw();
  db.prepare(`INSERT INTO contacto (id_empresa, nombre, email, es_principal, fuente) VALUES (?, 'Ana', ?, 1, 'seed')`).run(
    idEmpresa,
    `${idEmpresa}@test.com`,
  );
  const idContacto = ultimoId(db);
  db.prepare(`INSERT INTO cadencia (nombre) VALUES (?)`).run(`Cadencia ${idEmpresa}`);
  const idCadencia = ultimoId(db);
  db.prepare(`INSERT INTO paso_cadencia (id_cadencia, orden, dia_offset, canal, es_manual) VALUES (?, 1, 0, 'llamada', ?)`).run(
    idCadencia,
    esManual,
  );
  const idPaso = ultimoId(db);
  db.prepare(`INSERT INTO version_paso (id_paso, es_default) VALUES (?, 1)`).run(idPaso);
  const idVersion = ultimoId(db);
  db.prepare(`INSERT INTO segmento (nombre, definicion, id_organizacion) VALUES (?, '{}', ?)`).run(`Seg ${idEmpresa}`, ORG);
  const idSegmento = ultimoId(db);
  db.prepare(`INSERT INTO campana (nombre, id_cadencia, id_segmento, estado, modo) VALUES (?, ?, ?, 'activa', ?)`).run(
    'Precio ISPs B -- abre con llamada',
    idCadencia,
    idSegmento,
    modo,
  );
  const idCampana = ultimoId(db);
  db.prepare(`INSERT INTO inscripcion (id_campana, id_empresa, estado) VALUES (?, ?, 'activa')`).run(idCampana, idEmpresa);
  const idInscripcion = ultimoId(db);
  db.prepare(`INSERT INTO destinatario (id_inscripcion, id_contacto, estado) VALUES (?, ?, 'activo')`).run(idInscripcion, idContacto);
  const idDestinatario = ultimoId(db);
  db.prepare(
    `INSERT INTO paso_inscripcion (id_destinatario, id_paso, id_version, canal, estado, fecha_programada) VALUES (?, ?, ?, 'llamada', 'pendiente', ?)`,
  ).run(idDestinatario, idPaso, idVersion, fecha);
  db.close();
}

// El caso de la captura del 2026-08-03: SILCOM, ITELKOM, Segitel, ITEC SOLUTIONS y REDES Y
// TELECOMUNICACIONES, todas on_hold, todas con el paso de apertura vencido 6 dias, todas
// arriba de la cola.
test('on_hold con paso de cadencia vencido NO entra a la cola del dia, y queda visible aparte', () => {
  seedEmpresa('h-silcom', OWNER, 'on_hold', null);
  seedPasoVencido('h-silcom');

  const { filas, enHold } = cargarColaDeHoy(HOY, OWNER, ORG);
  assert.equal(
    filas.some((f) => f.id === 'h-silcom'),
    false,
    'on_hold no entra a Toques por la puerta de cadencias',
  );
  assert.deepEqual(
    enHold.map((f) => f.id),
    ['h-silcom'],
    'no desaparece: sale en su propia seccion, fuera del contador',
  );
});

test('firma_pago tampoco entra: ya es cliente', () => {
  seedEmpresa('h-cliente', OWNER, 'firma_pago', null);
  seedPasoVencido('h-cliente');

  const { filas, enHold } = cargarColaDeHoy(HOY, OWNER, ORG);
  assert.equal(filas.some((f) => f.id === 'h-cliente'), false);
  assert.equal(enHold.some((f) => f.id === 'h-cliente'), true);
});

test('contacto_iniciado con paso de cadencia vencido SI entra: es lo que el operador quiere ver', () => {
  seedEmpresa('h-contactada', OWNER, 'contacto_iniciado', null);
  seedPasoVencido('h-contactada');

  const { filas } = cargarColaDeHoy(HOY, OWNER, ORG);
  assert.equal(filas.some((f) => f.id === 'h-contactada'), true);
});

test('la caja de aprobacion de copys (manual + batch) no se toca: sigue trayendo lo suyo, on_hold incluido', () => {
  seedEmpresa('h-batch', OWNER, 'on_hold', null);
  seedPasoVencido('h-batch', { modo: 'batch' });

  const { filas, cadenciasAparte, enHold } = cargarColaDeHoy(HOY, OWNER, ORG);
  assert.equal(filas.some((f) => f.id === 'h-batch'), false, 'no es un toque del dia');
  assert.equal(enHold.some((f) => f.id === 'h-batch'), false, 'no se duplica: ya se ve en su caja');
  assert.equal(
    cadenciasAparte.some((p) => p.idEmpresa === 'h-batch'),
    true,
    'aprobar el copy de una reactivacion sigue siendo posible',
  );
});

test('toda fila de la cola del dia tiene fecha vencida o de hoy, y es del owner', () => {
  seedEmpresa('h-hoy', OWNER, 'oportunidad', HOY); // entra
  seedEmpresa('h-vencida', OWNER, 'cierre_documentacion', '2026-07-28'); // entra
  seedEmpresa('h-futura', OWNER, 'oportunidad', '2026-08-20'); // no: es programada
  seedEmpresa('h-sinfecha', OWNER, 'oportunidad', null); // no: falta decidir el paso
  seedEmpresa('h-contacto-hoy', OWNER, 'contacto_iniciado', '2026-07-30'); // entra
  seedEmpresa('h-ajena', OTRO_OWNER, 'oportunidad', '2026-07-28'); // no: otro owner
  seedEmpresa('h-hold-fecha', OWNER, 'on_hold', '2026-07-28'); // no: on_hold jamas
  seedEmpresa('h-lead', OWNER, 'lead', '2026-07-28'); // no: lead sin cadencia esta dormido

  const { filas } = cargarColaDeHoy(HOY, OWNER, ORG);
  const ids = filas.map((f) => f.id);

  for (const f of filas) {
    assert.ok(f.fecha != null && f.fecha <= HOY, `${f.id} entro a la cola del dia sin fecha vencida o de hoy (${f.fecha})`);
  }
  for (const dentro of ['h-hoy', 'h-vencida', 'h-contacto-hoy']) assert.ok(ids.includes(dentro), `falta ${dentro}`);
  for (const fuera of ['h-futura', 'h-sinfecha', 'h-ajena', 'h-hold-fecha', 'h-lead']) {
    assert.equal(ids.includes(fuera), false, `${fuera} no deberia estar en la cola del dia`);
  }
});

// Medido en produccion el 2026-08-03: TELNET TV SAS salia dos veces, una como deal caliente
// vencido y otra como paso de cadencia del mismo dia. Dos filas, un solo trabajo, el contador
// inflado en uno y dos elementos con la misma key en la lista.
test('una cuenta con deal vencido Y paso de cadencia sale UNA vez', () => {
  seedEmpresa('h-telnet', OWNER, 'cierre_documentacion', '2026-07-28');
  seedPasoVencido('h-telnet');

  const { filas } = cargarColaDeHoy(HOY, OWNER, ORG);
  assert.equal(filas.filter((f) => f.id === 'h-telnet').length, 1);
  assert.equal(filas.find((f) => f.id === 'h-telnet')?.bucket, 'cierre', 'gana la fila del deal, que sabe en que etapa esta');
});

// El contador de arriba y el badge del nav salen de esta misma lista, asi que "poder llegar a
// cero" es una propiedad de la composicion, no de la pantalla.
test('la cola del dia puede llegar a cero: un owner sin nada vencido ve una lista vacia', () => {
  const { filas } = cargarColaDeHoy(HOY, 'Owner Sin Nada', ORG);
  assert.deepEqual(filas, []);
});
