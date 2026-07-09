import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';
import {
  miembrosLibres,
  miembroLibrePorId,
  reclamarMiembro,
  setOwnerDeUsuario,
  reclamarMiembroYSetOwner,
  organizacionDeUsuario,
  dbDePrueba,
} from './organizacion-repository.ts';

let dbPath: string;

test.beforeEach(() => {
  dbPath = crearDbPrueba();
  const raw = new Database(dbPath);
  raw.exec(`
    CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, owner TEXT, admin INTEGER DEFAULT 0, updated_at INTEGER);
    INSERT INTO organizacion (id_organizacion, nombre) VALUES (1, 'Onepay');
    INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display)
      VALUES (1, 'Thomas Schumacher', 'Thomas Schumacher');
    INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display, id_user)
      VALUES (1, 'Sebastian Acosta Molina', 'Sebastián Acosta', 'user-sebastian');
    INSERT INTO user (id, name, email) VALUES ('user-nuevo', 'Thomas Schumacher', 'thomas@test.com');
  `);
  raw.close();
});

test.afterEach(() => {
  borrarDbPrueba(dbPath);
});

test('miembrosLibres devuelve solo los miembros sin id_user', () => {
  const db = dbDePrueba(dbPath);
  const libres = miembrosLibres(1, db);
  assert.deepEqual(libres.map((m) => m.nombreDisplay), ['Thomas Schumacher']);
});

test('miembroLibrePorId no devuelve un miembro ya reclamado', () => {
  const db = dbDePrueba(dbPath);
  const reclamado = miembroLibrePorId(2, db); // id 2 = Sebastian, ya tiene id_user
  assert.equal(reclamado, undefined);
});

test('reclamarMiembro tiene efecto la primera vez y falla la segunda (ya reclamado)', () => {
  const db = dbDePrueba(dbPath);
  const primero = reclamarMiembro(1, 'user-nuevo', db);
  assert.equal(primero, true);

  const segundo = reclamarMiembro(1, 'otro-user', db);
  assert.equal(segundo, false, 'un miembro ya reclamado no se puede reclamar otra vez');
});

test('setOwnerDeUsuario escribe el owner canonico directo en la tabla user', () => {
  const db = dbDePrueba(dbPath);
  setOwnerDeUsuario('user-nuevo', 'Thomas Schumacher', db);

  const raw = new Database(dbPath);
  const fila = raw.prepare(`SELECT owner FROM user WHERE id = ?`).get('user-nuevo') as any;
  assert.equal(fila.owner, 'Thomas Schumacher');
  raw.close();
});

test('reclamarMiembroYSetOwner reclama y setea el owner juntos, atomico', () => {
  const db = dbDePrueba(dbPath);
  const ok = reclamarMiembroYSetOwner(1, 'user-nuevo', 'Thomas Schumacher', db);
  assert.equal(ok, true);

  const raw = new Database(dbPath);
  const miembro = raw.prepare(`SELECT id_user FROM organizacion_miembro WHERE id_miembro = 1`).get() as any;
  assert.equal(miembro.id_user, 'user-nuevo');
  const usuario = raw.prepare(`SELECT owner FROM user WHERE id = ?`).get('user-nuevo') as any;
  assert.equal(usuario.owner, 'Thomas Schumacher');
  raw.close();
});

test('reclamarMiembroYSetOwner no toca la tabla user si el miembro ya estaba reclamado', () => {
  const db = dbDePrueba(dbPath);
  const primero = reclamarMiembroYSetOwner(1, 'user-nuevo', 'Thomas Schumacher', db);
  assert.equal(primero, true);

  const segundo = reclamarMiembroYSetOwner(1, 'otro-user', 'Thomas Schumacher', db);
  assert.equal(segundo, false, 'un miembro ya reclamado no se puede reclamar otra vez');

  const raw = new Database(dbPath);
  const otro = raw.prepare(`SELECT owner FROM user WHERE id = ?`).get('otro-user') as any;
  assert.equal(otro, undefined, 'el reclamo fallido no debe tocar la tabla user para el segundo usuario');
  raw.close();
});

test('organizacionDeUsuario incluye idOrganizacion, no solo el nombre', () => {
  const db = dbDePrueba(dbPath);
  const org = organizacionDeUsuario('user-sebastian', db);
  assert.equal(org?.idOrganizacion, 1);
  assert.equal(org?.nombreOrganizacion, 'Onepay');
});
