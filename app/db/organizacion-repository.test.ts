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
  ownersDisponibles,
  crearMiembroYSetOwner,
  organizacionVisitantesIdOCrear,
  crearMiembroVisitante,
  borrarUsuario,
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
    INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, organizacion_activa_id)
      VALUES ('e1', 'nit', 'Empresa Uno', 'empresa uno', 'activo', 'Sebastian Acosta Molina', 1);
    INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, organizacion_activa_id)
      VALUES ('e2', 'nit', 'Empresa Dos', 'empresa dos', 'activo', 'Ana Gomez', 1);
    INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, organizacion_activa_id)
      VALUES ('e3', 'nit', 'Empresa Tres', 'empresa tres', 'activo', 'Ana Gomez', 1);
    INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, organizacion_activa_id)
      VALUES ('e4', 'nit', 'Empresa Cuatro', 'empresa cuatro', 'activo', NULL, 1);
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

test('ownersDisponibles devuelve owners de empresa sin duplicados, sin nulls y sin los ya reclamados', () => {
  const db = dbDePrueba(dbPath);
  const disponibles = ownersDisponibles(1, db);
  // 'Sebastian Acosta Molina' ya esta reclamado por organizacion_miembro (id_user seteado
  // en el beforeEach); 'Ana Gomez' aparece dos veces en empresa pero debe salir una sola vez.
  assert.deepEqual(disponibles, ['Ana Gomez']);
});

test('crearMiembroYSetOwner crea el miembro ya reclamado y setea el owner, atomico', () => {
  const db = dbDePrueba(dbPath);
  const ok = crearMiembroYSetOwner(1, 'Ana Gomez', 'Ana Gomez', 'user-nuevo', db);
  assert.equal(ok, true);

  const raw = new Database(dbPath);
  const miembro = raw.prepare(`SELECT id_user FROM organizacion_miembro WHERE owner_canonico = ?`).get('Ana Gomez') as any;
  assert.equal(miembro.id_user, 'user-nuevo');
  const usuario = raw.prepare(`SELECT owner FROM user WHERE id = ?`).get('user-nuevo') as any;
  assert.equal(usuario.owner, 'Ana Gomez');
  raw.close();

  // Ya reclamado: ahora ownersDisponibles no debe volver a ofrecerlo.
  assert.deepEqual(ownersDisponibles(1, db), []);
});

test('crearMiembroYSetOwner falla si otro usuario ya reclamo ese owner (carrera)', () => {
  const db = dbDePrueba(dbPath);
  const primero = crearMiembroYSetOwner(1, 'Ana Gomez', 'Ana Gomez', 'user-nuevo', db);
  assert.equal(primero, true);

  const segundo = crearMiembroYSetOwner(1, 'Ana Gomez', 'Ana Gomez', 'otro-user', db);
  assert.equal(segundo, false, 'un owner ya reclamado no se puede volver a reclamar');

  const raw = new Database(dbPath);
  const otro = raw.prepare(`SELECT owner FROM user WHERE id = ?`).get('otro-user') as any;
  assert.equal(otro, undefined, 'el reclamo fallido no debe tocar la tabla user para el segundo usuario');
  raw.close();
});

test('borrarUsuario elimina la fila de user (compensacion del registro no atomico)', () => {
  const db = dbDePrueba(dbPath);
  borrarUsuario('user-nuevo', db);

  const raw = new Database(dbPath);
  const fila = raw.prepare(`SELECT id FROM user WHERE id = ?`).get('user-nuevo');
  assert.equal(fila, undefined, 'el usuario huerfano no debe quedar en la tabla user');
  raw.close();
});

test('crearMiembroYSetOwner que falla + borrarUsuario deja la tabla user sin huerfanos (Task 1)', () => {
  const db = dbDePrueba(dbPath);
  // 'Sebastian Acosta Molina' ya esta reclamado por 'user-sebastian' (beforeEach): este
  // reclamo debe fallar, replicando la carrera que hoy entierra al usuario.
  const creado = crearMiembroYSetOwner(1, 'Sebastian Acosta Molina', 'Sebastian Acosta Molina', 'user-nuevo', db);
  assert.equal(creado, false);

  borrarUsuario('user-nuevo', db);

  const raw = new Database(dbPath);
  const fila = raw.prepare(`SELECT id FROM user WHERE id = ?`).get('user-nuevo');
  assert.equal(fila, undefined, 'sin la compensacion este usuario quedaria autenticado y sin organizacion para siempre');
  raw.close();
});

test('crearMiembroYSetOwner que revienta con excepcion (no el `false` controlado) tambien se compensa con borrarUsuario', () => {
  const db = dbDePrueba(dbPath);
  // Provoca un throw real de la transaccion (no la carrera manejada con `false`): la tabla
  // no existe para esta conexion, asi que el INSERT dentro de la tx de Drizzle revienta.
  // Este es el caso que en produccion enterro a felipe@onepay.la: actions.ts no tenia
  // try/catch en la rama 'onepay' y un throw asi se colaba sin compensar.
  const raw = new Database(dbPath);
  raw.exec('DROP TABLE organizacion_miembro');
  raw.close();

  assert.throws(() => crearMiembroYSetOwner(1, 'Ana Gomez', 'Ana Gomez', 'user-nuevo', db));

  borrarUsuario('user-nuevo', db);

  const check = new Database(dbPath);
  const fila = check.prepare(`SELECT id FROM user WHERE id = ?`).get('user-nuevo');
  assert.equal(fila, undefined, 'un throw de crearMiembroYSetOwner tambien debe dejar la tabla user sin huerfanos');
  check.close();
});

test('organizacionVisitantesIdOCrear crea la organizacion la primera vez y reusa el mismo id despues', () => {
  const db = dbDePrueba(dbPath);
  const primero = organizacionVisitantesIdOCrear(db);
  const segundo = organizacionVisitantesIdOCrear(db);
  assert.equal(primero, segundo, 'la segunda llamada debe encontrar la fila ya creada, no duplicarla');

  const raw = new Database(dbPath);
  const filas = raw.prepare(`SELECT id_organizacion FROM organizacion WHERE nombre = 'Visitantes'`).all();
  assert.equal(filas.length, 1, 'solo debe existir una fila Visitantes sin importar cuantas veces se llame');
  raw.close();
});

test('crearMiembroVisitante cae en la organizacion Visitantes, no en Onepay', () => {
  const db = dbDePrueba(dbPath);
  const raw0 = new Database(dbPath);
  raw0.prepare(`INSERT INTO user (id, name, email) VALUES ('user-visitante', 'Juan Curioso', 'juan@test.com')`).run();
  raw0.close();

  crearMiembroVisitante('Juan Curioso', 'user-visitante', db);

  const idVisitantes = organizacionVisitantesIdOCrear(db);
  const org = organizacionDeUsuario('user-visitante', db);
  assert.equal(org?.idOrganizacion, idVisitantes);
  assert.notEqual(org?.idOrganizacion, 1, 'un visitante nunca debe terminar en la organizacion Onepay');

  const raw = new Database(dbPath);
  const usuario = raw.prepare(`SELECT owner FROM user WHERE id = ?`).get('user-visitante') as any;
  assert.equal(usuario.owner, 'Juan Curioso');
  raw.close();
});

test('crearMiembroVisitante no choca si dos visitantes eligen el mismo nombre (freeform, sin dueno unico)', () => {
  const db = dbDePrueba(dbPath);
  crearMiembroVisitante('Ana Duplicada', 'user-visitante-1', db);
  crearMiembroVisitante('Ana Duplicada', 'user-visitante-2', db);

  const org1 = organizacionDeUsuario('user-visitante-1', db);
  const org2 = organizacionDeUsuario('user-visitante-2', db);
  assert.equal(org1?.idOrganizacion, org2?.idOrganizacion, 'ambos visitantes caen en la misma organizacion Visitantes');
});
