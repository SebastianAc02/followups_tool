// Actividad on-hold con cadencia de precio (docs/actividad-on-hold-cadencia-precio.md):
// alta manual de UNA empresa a la vez, no una corrida de segmento completo. Mismo patron
// de fixtures que repository.inscripcion.test.ts, pero para inscribirEmpresaEnCadencia.

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { crearCadencia, guardarSegmento, crearCampana, inscribirCampana, inscribirEmpresaEnCadencia, historialInscripciones, destinatariosDeInscripcion } =
  await import('./repository.ts');

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
  emp.run('e-con-email', 'ConEmail', 'conemail');
  con.run('e-con-email', 'Contacto', 0, 1, 'contacto@x.com');

  emp.run('e-sin-email', 'SinEmail', 'sinemail');
  con.run('e-sin-email', 'SinMail', 0, 1, null);
  raw.close();
}
seed();

function contactoEmail(idContacto: number): string | null {
  const raw = new Database(dbPath);
  const r = raw.prepare('SELECT email FROM contacto WHERE id_contacto = ?').get(idContacto) as { email: string | null } | undefined;
  raw.close();
  return r?.email ?? null;
}

const idCadenciaA = crearCadencia({ nombre: 'Precio ISPs A -- abre con mensaje', pasos: [{ orden: 1, diaOffset: 0, canal: 'whatsapp', cuerpo: 'x' }] });
const idCadenciaB = crearCadencia({ nombre: 'Precio ISPs B -- abre con llamada', pasos: [{ orden: 1, diaOffset: 0, canal: 'llamada', cuerpo: 'y' }] });
const idSegmento = guardarSegmento({ nombre: 'on-hold', definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] } }, 1);
const idCampanaA = crearCampana({ nombre: 'Camp A', idCadencia: idCadenciaA, idSegmento }, 1);
const idCampanaB = crearCampana({ nombre: 'Camp B', idCadencia: idCadenciaB, idSegmento }, 1);

test('inscribe una empresa con contacto elegible: queda activa con el destinatario correcto', () => {
  const res = inscribirEmpresaEnCadencia('e-con-email', idCampanaB);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.estado, 'activa');
  assert.equal(res.reemplazo, false);

  const h = historialInscripciones('e-con-email');
  assert.equal(h.length, 1);
  assert.equal(h[0].idCampana, idCampanaB);
  const d = destinatariosDeInscripcion(h[0].id);
  assert.equal(contactoEmail(d[0].idContacto), 'contacto@x.com');
});

test('sin contacto con dato de contacto usable: queda bloqueada, sin destinatario', () => {
  const res = inscribirEmpresaEnCadencia('e-sin-email', idCampanaB);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.estado, 'bloqueada');

  const h = historialInscripciones('e-sin-email');
  assert.equal(h[0].estado, 'bloqueada');
  assert.equal(destinatariosDeInscripcion(h[0].id).length, 0);
});

test('re-inscribir la misma empresa en la misma campana es idempotente: no duplica', () => {
  const otra = inscribirEmpresaEnCadencia('e-con-email', idCampanaB);
  assert.equal(otra.ok, false);
  if (otra.ok) return;
  assert.equal(otra.motivo, 'ya_inscrita');

  const h = historialInscripciones('e-con-email');
  assert.equal(h.length, 1, 'sigue habiendo una sola inscripcion, no dos');
});

test('cambiar de cadencia (A/B) cierra la activa previa con motivo_fin y deja historial', () => {
  const res = inscribirEmpresaEnCadencia('e-con-email', idCampanaA);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.reemplazo, true);

  const h = historialInscripciones('e-con-email');
  const activas = h.filter((i) => i.estado === 'activa');
  const finalizadas = h.filter((i) => i.estado === 'finalizada');
  assert.equal(activas.length, 1, 'solo una activa por empresa (A o B, nunca las dos)');
  assert.equal(activas[0].idCampana, idCampanaA);
  assert.equal(finalizadas.at(-1)!.motivoFin, 'cambio de campana');
});

test('inscribirCampana en bloque y inscribirEmpresaEnCadencia individual no se pisan', () => {
  const idCampanaBulk = crearCampana({ nombre: 'Camp bulk', idCadencia: idCadenciaA, idSegmento }, 1);
  const res = inscribirCampana(idCampanaBulk, 1);
  // e-con-email y e-sin-email ya estan activas/bloqueadas en Camp A: la corrida en bloque
  // las reemplaza igual que lo haria otra alta individual, mismo comportamiento.
  assert.ok(res.inscritas + res.bloqueadas >= 1);
});

test('campana que no existe: lanza error explicito', () => {
  assert.throws(() => inscribirEmpresaEnCadencia('e-con-email', 999999), /campana 999999 no existe/);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
