// V4.8: prueba del puente agendaEnSeco (motor de fechas aplicado a inscripciones reales,
// sin materializar ni enviar). DB temporal.

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { crearCadencia, guardarSegmento, crearCampana, inscribirCampana, agendaEnSeco, pausarCampana } = await import('./repository.ts');

// dos empresas on_hold, una con email (activa) y otra sin (bloqueada, no entra a la agenda)
function seed() {
  const raw = new Database(dbPath);
  const emp = raw.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, categoria)
     VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', 'isp')`,
  );
  emp.run('e1', 'Uno', 'uno');
  emp.run('e2', 'Dos', 'dos'); // sin contacto con email -> bloqueada
  raw
    .prepare(`INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, email, fuente) VALUES ('e1','Con',0,1,'c@x.com','seed')`)
    .run();
  raw.close();
}
seed();

const idCadencia = crearCadencia({
  nombre: 'C',
  pasos: [
    { orden: 1, diaOffset: 0, canal: 'correo', cuerpo: 'a' },
    { orden: 2, diaOffset: 3, canal: 'whatsapp', cuerpo: 'b', esManual: true },
  ],
});
const idSegmento = guardarSegmento({ nombre: 'on-hold', definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] } });

test('agendaEnSeco muestra el primer paso de las inscripciones activas para hoy', () => {
  const idCampana = crearCampana({ nombre: 'Camp', idCadencia, idSegmento }, 1);
  const res = inscribirCampana(idCampana);
  assert.equal(res.inscritas, 1); // e1
  assert.equal(res.bloqueadas, 1); // e2 sin email

  // fecha_inscripcion es "ahora" (ISO completo); el motor compara por dia. Uso una fecha
  // muy futura como "hoy" para garantizar que el paso 1 (offset 0) ya este debido.
  const agenda = agendaEnSeco('2099-01-01', { diasBloqueados: [], corrimiento: 'siguiente' });
  assert.equal(agenda.length, 1, 'solo la activa (e1) entra a la agenda, la bloqueada no');
  assert.equal(agenda[0].idEmpresa, 'e1');
  assert.equal(agenda[0].orden, 1, 'el primer paso, no toda la cadencia (sin rafaga)');
});

test('agendaEnSeco vacia cuando ninguna activa tiene paso debido todavia', () => {
  // hoy = 1970 (antes de cualquier inscripcion): el primer paso aun no llega
  const agenda = agendaEnSeco('1970-01-01', { diasBloqueados: [], corrimiento: 'siguiente' });
  assert.equal(agenda.length, 0);
});

// Fase 7 (pausar campana): sin este filtro, "pausar" solo cambiaria una etiqueta en
// campana.estado pero la agenda seguiria generando pasos nuevos cada dia.
test('agendaEnSeco no muestra pasos de una campana pausada', () => {
  const idCampana2 = crearCampana({ nombre: 'Camp2', idCadencia, idSegmento }, 1);
  inscribirCampana(idCampana2); // reemplaza la inscripcion de e1 en 'Camp' (test anterior)

  const antes = agendaEnSeco('2099-01-01', { diasBloqueados: [], corrimiento: 'siguiente' });
  assert.equal(antes.length, 1, 'antes de pausar, e1 sigue debido en Camp2');

  const res = pausarCampana(idCampana2);
  assert.equal(res.ok, true);

  const despues = agendaEnSeco('2099-01-01', { diasBloqueados: [], corrimiento: 'siguiente' });
  assert.equal(despues.length, 0, 'pausada: la agenda no le genera pasos nuevos');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
