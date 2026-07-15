// T11: upsertContactoNotion escribe Contacto Principal + Buying Comittee en `contacto`,
// fuente='notion', cargo_categoria clasificado (clasificarCargo). Idempotente por
// (id_empresa, nombre normalizado) o telefono; defiende uq_contacto_principal
// demotando cualquier otro es_principal=1 de la misma empresa antes de marcar el nuevo.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { upsertContactoNotion } = await import('./repository.ts');

function seedEmpresa(id: string, nombreOficial: string) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, organizacion_activa_id)
       VALUES (?, 'nit', ?, ?, 'lead', 1)`,
    )
    .run(id, nombreOficial, nombreOficial.toLowerCase());
  raw.close();
}

function seedContacto(idEmpresa: string, columnas: Record<string, string | number>) {
  const raw = new Database(dbPath);
  const cols = Object.keys(columnas);
  const placeholders = cols.map(() => '?').join(', ');
  raw
    .prepare(`INSERT INTO contacto (id_empresa, ${cols.join(', ')}) VALUES (?, ${placeholders})`)
    .run(idEmpresa, ...cols.map((c) => columnas[c]));
  raw.close();
}

function leerContactos(idEmpresa: string) {
  const raw = new Database(dbPath);
  const filas = raw.prepare('SELECT * FROM contacto WHERE id_empresa = ? ORDER BY id_contacto').all(idEmpresa) as Record<
    string,
    unknown
  >[];
  raw.close();
  return filas;
}

test('Jigartel: Contacto Principal Nayris / 313 7933653 queda con es_principal=1, fuente=notion', () => {
  seedEmpresa('jigartel-1', 'Jigartel');

  upsertContactoNotion('jigartel-1', [
    { nombre: 'Nayris', cargo: '', telefono: '313 7933653', email: '', esPrincipal: true },
  ]);

  const contactos = leerContactos('jigartel-1');
  assert.equal(contactos.length, 1);
  assert.equal(contactos[0].nombre, 'Nayris');
  assert.equal(contactos[0].telefono, '313 7933653');
  assert.equal(contactos[0].es_principal, 1);
  assert.equal(contactos[0].fuente, 'notion');
});

test('correr dos veces con el mismo Contacto Principal no duplica (idempotente)', () => {
  seedEmpresa('jigartel-2', 'Jigartel');
  const contactos = [{ nombre: 'Nayris', cargo: '', telefono: '313 7933653', email: '', esPrincipal: true }];

  upsertContactoNotion('jigartel-2', contactos);
  upsertContactoNotion('jigartel-2', contactos);

  assert.equal(leerContactos('jigartel-2').length, 1);
});

test('idempotente tambien por nombre normalizado cuando no hay telefono en la fila nueva', () => {
  seedEmpresa('sinfono-1', 'Sin Telefono SAS');

  upsertContactoNotion('sinfono-1', [{ nombre: '  ana Ruiz  ', cargo: 'Gerente', telefono: '', email: '', esPrincipal: true }]);
  upsertContactoNotion('sinfono-1', [{ nombre: 'Ana Ruiz', cargo: 'Gerente General', telefono: '', email: 'ana@x.com', esPrincipal: true }]);

  const contactos = leerContactos('sinfono-1');
  assert.equal(contactos.length, 1);
  assert.equal(contactos[0].email, 'ana@x.com');
  assert.equal(contactos[0].cargo_categoria, 'gerente');
});

test('demota el es_principal viejo si otro contacto ya lo tenia (defensa de uq_contacto_principal)', () => {
  seedEmpresa('demote-1', 'Demote SAS');
  seedContacto('demote-1', { nombre: 'Viejo Principal', es_principal: 1, fuente: 'seed' });

  upsertContactoNotion('demote-1', [
    { nombre: 'Nuevo Principal', cargo: 'CEO / Dueño', telefono: '300 0000000', email: '', esPrincipal: true },
  ]);

  const contactos = leerContactos('demote-1');
  const viejo = contactos.find((c) => c.nombre === 'Viejo Principal');
  const nuevo = contactos.find((c) => c.nombre === 'Nuevo Principal');
  assert.equal(viejo?.es_principal, 0);
  assert.equal(nuevo?.es_principal, 1);
  assert.equal(nuevo?.cargo_categoria, 'dueno');
});

test('Buying Comittee: inserta varios contactos no-principales, ninguno se pisa', () => {
  seedEmpresa('afinia-1', 'AFINIA');

  upsertContactoNotion('afinia-1', [
    { nombre: 'Fabián Rivera', cargo: 'Director Comercial', telefono: '+57 320 6411482', email: 'fabian.rivera@afinia.com.co', linkedin: '', esPrincipal: false },
    { nombre: 'Ricardo Arango', cargo: 'Gerente General', telefono: '+57 317 3715318', email: 'ricardo.arango@afinia.com.co', linkedin: '', esPrincipal: false },
    { nombre: 'Nelson Guerra', cargo: 'Recaudo', telefono: '+57 315 3169406', email: 'nelson.guerra@afinia.com.co', linkedin: '', esPrincipal: false },
  ]);

  const contactos = leerContactos('afinia-1');
  assert.equal(contactos.length, 3);
  assert.ok(contactos.every((c) => c.es_principal === 0));
  assert.ok(contactos.every((c) => c.fuente === 'notion'));
  const nelson = contactos.find((c) => c.nombre === 'Nelson Guerra');
  assert.equal(nelson?.cargo_categoria, 'financiero');
});

test('contactos con nombre vacio o en blanco se saltan (no se insertan)', () => {
  seedEmpresa('vacio-1', 'Vacio SAS');

  upsertContactoNotion('vacio-1', [
    { nombre: '', cargo: '', telefono: '', email: '', esPrincipal: true },
    { nombre: '   ', cargo: '', telefono: '', email: '', esPrincipal: false },
    { nombre: 'Real Contacto', cargo: '', telefono: '', email: '', esPrincipal: false },
  ]);

  const contactos = leerContactos('vacio-1');
  assert.equal(contactos.length, 1);
  assert.equal(contactos[0].nombre, 'Real Contacto');
});

test('guarda linkedin cuando viene en la fila (Buying Comittee)', () => {
  seedEmpresa('linkedin-1', 'Linkedin SAS');

  upsertContactoNotion('linkedin-1', [
    { nombre: 'Camilo Ruiz', cargo: 'Gerente', telefono: '300 1234567', email: '', linkedin: 'linkedin.com/in/camiloruiz', esPrincipal: false },
  ]);

  const contactos = leerContactos('linkedin-1');
  assert.equal(contactos[0].linkedin, 'linkedin.com/in/camiloruiz');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
