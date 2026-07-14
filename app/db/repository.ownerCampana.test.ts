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
  fijarOwnerCampana,
  lineaWhatsappActivaDeOwner,
} = await import('./repository.ts');

function raw() {
  return new Database(dbPath);
}

function seedEmpresa(id: string, categoria: string) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, categoria)
     VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', ?)`,
  ).run(id, id, id.toLowerCase(), categoria);
  db.close();
}

function seedMiembroConLinea(ownerCanonico: string, idUser: string, referenciaProveedor: string, estado: string) {
  const db = raw();
  db.prepare(`INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display, id_user) VALUES (1, ?, ?, ?)`)
    .run(ownerCanonico, ownerCanonico, idUser);
  db.prepare(`INSERT INTO linea_whatsapp (numero, tipo, id_usuario, referencia_proveedor, estado) VALUES ('573000000001', 'personal', ?, ?, ?)`)
    .run(idUser, referenciaProveedor, estado);
  db.close();
}

function seedLineaPool(referenciaProveedor: string, estado: string) {
  const db = raw();
  db.prepare(`INSERT INTO linea_whatsapp (numero, tipo, referencia_proveedor, estado) VALUES ('573000000002', 'pool', ?, ?)`)
    .run(referenciaProveedor, estado);
  db.close();
}

seedEmpresa('e-owner-1', 'owner-cat-1');
const idCadencia = crearCadencia({ nombre: 'C owner', pasos: [{ orden: 1, diaOffset: 0, canal: 'whatsapp', cuerpo: 'hola' }] });
const idSegmento = guardarSegmento({ nombre: 'owner-seg', definicion: { condiciones: [{ campo: 'categoria', op: 'en', valores: ['owner-cat-1'] }] } }, 1);

test('fijarOwnerCampana persiste el owner de la campana', () => {
  const idCampana = crearCampana({ nombre: 'Camp sin owner', idCadencia, idSegmento }, 1);
  fijarOwnerCampana(idCampana, 'Felipe Castro');

  const db = raw();
  const fila = db.prepare('SELECT owner FROM campana WHERE id_campana = ?').get(idCampana) as { owner: string };
  db.close();
  assert.strictEqual(fila.owner, 'Felipe Castro');
});

test('lineaWhatsappActivaDeOwner devuelve la linea PROPIA del dueno, no cualquier linea activa', () => {
  seedMiembroConLinea('Felipe Castro', 'user-felipe', 'linea-felipe', 'activa');
  seedMiembroConLinea('Thomas Schumacher', 'user-thomas', 'linea-thomas', 'activa');

  const deFelipe = lineaWhatsappActivaDeOwner('Felipe Castro', 1);
  const deThomas = lineaWhatsappActivaDeOwner('Thomas Schumacher', 1);

  assert.deepEqual(deFelipe, { referenciaProveedor: 'linea-felipe' });
  assert.deepEqual(deThomas, { referenciaProveedor: 'linea-thomas' });
});

test('lineaWhatsappActivaDeOwner devuelve null si el dueno no tiene linea activa', () => {
  seedMiembroConLinea('Camilo fonseca', 'user-camilo', 'linea-camilo', 'caida');
  assert.strictEqual(lineaWhatsappActivaDeOwner('Camilo fonseca', 1), null);
});

test('lineaWhatsappActivaDeOwner devuelve null si el owner no existe como miembro', () => {
  assert.strictEqual(lineaWhatsappActivaDeOwner('Nadie Real', 1), null);
});

test('lineaWhatsappActivaDeOwner(null) cae al fallback de la linea de pool (campana vieja sin owner)', () => {
  seedLineaPool('linea-pool', 'activa');
  assert.deepEqual(lineaWhatsappActivaDeOwner(null, 1), { referenciaProveedor: 'linea-pool' });
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
