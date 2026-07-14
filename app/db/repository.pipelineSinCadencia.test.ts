// Franja "Sin cadencia" de /seguimiento (2026-07-14): toques manuales (empresas con un
// follow-up pendiente) que NO estan en una cadencia activa. Complementa pipelineGlobal, que
// solo trae inscripciones. DB propia y aislada (mismo patron que repository.ordenLimite.test.ts).

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { pipelineSinCadencia } = await import('./repository.ts');

const HOY = '2026-07-14';

function seed() {
  const raw = new Database(dbPath);
  const insEmpresa = raw.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, es_cliente, estado_notion, owner, proximo_follow_up_fecha, proximo_canal, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'activo', 0, ?, ?, ?, ?, ?)`,
  );
  // Manual vencido: follow-up pasado, sin inscripcion -> SI aparece.
  insEmpresa.run('manual-vencido', 'Manual Vencido', 'manual vencido', 'lead', 'Sebastian', '2026-06-01', 'llamada', 1);
  // Manual de hoy: follow-up = hoy, sin inscripcion -> SI aparece, esHoy=true.
  insEmpresa.run('manual-hoy', 'Manual Hoy', 'manual hoy', 'cierre_documentacion', 'Sebastian', HOY, 'whatsapp', 1);
  // En cadencia: tiene follow-up pero esta en inscripcion activa -> NO aparece (va en las franjas "Toque N").
  insEmpresa.run('en-cadencia', 'En Cadencia', 'en cadencia', 'lead', 'Sebastian', '2026-06-01', 'correo', 1);
  // Dormido: sin fecha -> NO aparece.
  insEmpresa.run('dormido', 'Dormido', 'dormido', 'lead', 'Sebastian', null, 'llamada', 1);
  // Otra org: follow-up pasado, sin inscripcion, pero org 2 -> NO aparece cuando pido org 1.
  insEmpresa.run('otra-org', 'Otra Org', 'otra org', 'lead', 'Sebastian', '2026-06-01', 'llamada', 2);
  // contacto_iniciado: Sebastian lo quiere DENTRO (unico "no caliente" que sigue).
  insEmpresa.run('manual-contacto', 'Manual Contacto', 'manual contacto', 'contacto_iniciado', 'Sebastian', '2026-06-01', 'llamada', 1);
  // on_hold: dormido -> NO aparece aunque tenga fecha.
  insEmpresa.run('manual-onhold', 'Manual OnHold', 'manual onhold', 'on_hold', 'Sebastian', '2026-06-01', 'llamada', 1);
  // firma_pago: cliente ganado -> NO aparece aunque tenga fecha.
  insEmpresa.run('manual-cliente', 'Manual Cliente', 'manual cliente', 'firma_pago', 'Sebastian', '2026-06-01', 'llamada', 1);

  // Cadencia activa para 'en-cadencia'.
  raw.prepare(`INSERT INTO cadencia (id_cadencia, nombre) VALUES (1, 'Cad')`).run();
  raw.prepare(`INSERT INTO segmento (id_segmento, nombre, definicion, id_organizacion) VALUES (1, 'Seg', '{}', 1)`).run();
  raw.prepare(`INSERT INTO campana (id_campana, nombre, id_cadencia, id_segmento, estado, id_organizacion) VALUES (1, 'Camp', 1, 1, 'activa', 1)`).run();
  raw.prepare(`INSERT INTO inscripcion (id_inscripcion, id_campana, id_empresa, estado) VALUES (1, 1, 'en-cadencia', 'activa')`).run();

  raw.close();
}
seed();

test('pipelineSinCadencia trae toques manuales vencidos/de hoy sin cadencia activa, de la org', () => {
  const filas = pipelineSinCadencia(1, HOY);
  const ids = filas.map((f) => f.idEmpresa).sort();
  assert.deepEqual(ids, ['manual-contacto', 'manual-hoy', 'manual-vencido']);
});

test('pipelineSinCadencia excluye on_hold (dormidos) y firma_pago (clientes), incluye contacto_iniciado', () => {
  const filas = pipelineSinCadencia(1, HOY);
  const ids = filas.map((f) => f.idEmpresa);
  assert.ok(!ids.includes('manual-onhold'), 'on_hold no debe salir (es dormido)');
  assert.ok(!ids.includes('manual-cliente'), 'firma_pago no debe salir (es cliente ganado)');
  assert.ok(ids.includes('manual-contacto'), 'contacto_iniciado si debe salir');
});

test('pipelineSinCadencia excluye empresas en cadencia activa (esas van en las franjas de toque)', () => {
  const filas = pipelineSinCadencia(1, HOY);
  assert.ok(!filas.some((f) => f.idEmpresa === 'en-cadencia'));
});

test('pipelineSinCadencia excluye leads dormidos (sin fecha de follow-up)', () => {
  const filas = pipelineSinCadencia(1, HOY);
  assert.ok(!filas.some((f) => f.idEmpresa === 'dormido'));
});

test('pipelineSinCadencia respeta la organizacion', () => {
  const filas = pipelineSinCadencia(1, HOY);
  assert.ok(!filas.some((f) => f.idEmpresa === 'otra-org'));
});

test('pipelineSinCadencia marca esHoy cuando el follow-up es hoy', () => {
  const filas = pipelineSinCadencia(1, HOY);
  const hoy = filas.find((f) => f.idEmpresa === 'manual-hoy');
  const vencido = filas.find((f) => f.idEmpresa === 'manual-vencido');
  assert.equal(hoy?.esHoy, true);
  assert.equal(vencido?.esHoy, false);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
