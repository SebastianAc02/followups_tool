// V4.5: pruebas de inscripcion de campana en la DB. Cubre los 4 destinatarios default
// (KDM, principal, primero, bloqueada) y el cambio de campana con historial.

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
  historialInscripciones,
  inscripcionesBloqueadas,
  destinatariosDeInscripcion,
  resolverInscripcionBloqueada,
} = await import('./repository.ts');

// Seed: 4 empresas isp on_hold con distintos perfiles de contactos.
function seed() {
  const raw = new Database(dbPath);
  const emp = raw.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, categoria)
     VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', 'isp')`,
  );
  const con = raw.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, email, fuente)
     VALUES (?, ?, ?, ?, ?, 'seed')`,
  );
  // e-kdm: tiene KDM con email (y otros)
  emp.run('e-kdm', 'ConKDM', 'conkdm');
  con.run('e-kdm', 'Principal', 0, 1, 'ppal@x.com');
  con.run('e-kdm', 'ElKDM', 1, 0, 'kdm@x.com');
  // e-ppal: sin KDM, principal con email
  emp.run('e-ppal', 'ConPrincipal', 'conprincipal');
  con.run('e-ppal', 'Primero', 0, 0, 'primero@x.com');
  con.run('e-ppal', 'Principal', 0, 1, 'ppal@x.com');
  // e-primero: sin KDM ni principal, primero con email gana
  emp.run('e-primero', 'ConPrimero', 'conprimero');
  con.run('e-primero', 'Uno', 0, 0, 'uno@x.com');
  con.run('e-primero', 'Dos', 0, 0, 'dos@x.com');
  // e-bloq: KDM sin email -> bloqueada
  emp.run('e-bloq', 'SinEmail', 'sinemail');
  con.run('e-bloq', 'KDMsinmail', 1, 0, null);
  raw.close();
}
seed();

const idCadencia = crearCadencia({ nombre: 'C', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', cuerpo: 'x' }] });
const idSegmento = guardarSegmento({ nombre: 'on-hold', definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] } });

function contactoEmail(idContacto: number): string | null {
  const raw = new Database(dbPath);
  const r = raw.prepare('SELECT email FROM contacto WHERE id_contacto = ?').get(idContacto) as any;
  raw.close();
  return r?.email ?? null;
}

test('inscribir cubre los 4 defaults: 3 activas (KDM/principal/primero) + 1 bloqueada', () => {
  const idCampana = crearCampana({ nombre: 'Camp A', idCadencia, idSegmento });
  const res = inscribirCampana(idCampana);

  assert.equal(res.inscritas, 3);
  assert.equal(res.bloqueadas, 1);
  assert.equal(res.reemplazos, 0);

  // e-kdm -> destinatario es el KDM (kdm@x.com)
  const hKdm = historialInscripciones('e-kdm');
  assert.equal(hKdm.length, 1);
  assert.equal(hKdm[0].estado, 'activa');
  const dKdm = destinatariosDeInscripcion(hKdm[0].id);
  assert.equal(contactoEmail(dKdm[0].idContacto), 'kdm@x.com');

  // e-ppal -> el principal
  const dPpal = destinatariosDeInscripcion(historialInscripciones('e-ppal')[0].id);
  assert.equal(contactoEmail(dPpal[0].idContacto), 'ppal@x.com');

  // e-primero -> el primero con email
  const dPrimero = destinatariosDeInscripcion(historialInscripciones('e-primero')[0].id);
  assert.equal(contactoEmail(dPrimero[0].idContacto), 'uno@x.com');

  // e-bloq -> bloqueada, sin destinatario
  const hBloq = historialInscripciones('e-bloq');
  assert.equal(hBloq[0].estado, 'bloqueada');
  assert.equal(destinatariosDeInscripcion(hBloq[0].id).length, 0);
});

test('re-correr la misma campana es idempotente: todo saltado, sin duplicar', () => {
  const idCampana = crearCampana({ nombre: 'Camp A2', idCadencia, idSegmento });
  inscribirCampana(idCampana);
  const otra = inscribirCampana(idCampana);
  assert.equal(otra.saltadas, 4);
  assert.equal(otra.inscritas, 0);
});

test('cambio de campana: la empresa sale de la anterior con motivo_fin y deja historial', () => {
  // e-kdm ya tiene una activa (Camp A). Nueva campana sobre el mismo segmento.
  const idCampanaB = crearCampana({ nombre: 'Camp B', idCadencia, idSegmento });
  const res = inscribirCampana(idCampanaB);
  assert.ok(res.reemplazos >= 1, 'al menos las activas previas se reemplazan');

  const h = historialInscripciones('e-kdm');
  // una finalizada (la vieja) + una activa (la nueva)
  const finalizadas = h.filter((i) => i.estado === 'finalizada');
  const activas = h.filter((i) => i.estado === 'activa');
  assert.equal(activas.length, 1, 'solo una activa por empresa');
  assert.ok(finalizadas.length >= 1, 'la anterior quedo en el historial');
  assert.equal(finalizadas.at(-1)!.motivoFin, 'cambio de campana');
});

test('resolver una bloqueada la promueve a activa con su destinatario', () => {
  const bloqueadas = inscripcionesBloqueadas();
  const deBloq = bloqueadas.find((b) => b.idEmpresa === 'e-bloq');
  assert.ok(deBloq);

  // agrega un contacto con email a e-bloq y resuelve a mano
  const raw = new Database(dbPath);
  const ins = raw.prepare(`INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, email, fuente) VALUES ('e-bloq','Nuevo',0,0,'nuevo@x.com','manual')`).run();
  raw.close();

  resolverInscripcionBloqueada(deBloq!.id, Number(ins.lastInsertRowid));

  const h = historialInscripciones('e-bloq');
  const activa = h.find((i) => i.id === deBloq!.id);
  assert.equal(activa!.estado, 'activa');
  assert.equal(destinatariosDeInscripcion(deBloq!.id).length, 1);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
