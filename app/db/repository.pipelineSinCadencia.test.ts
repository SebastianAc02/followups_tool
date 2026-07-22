// B + L (2026-07-15): pipelineSinCadencia era org-wide (Sebastian veia las cuentas de
// Thomas: EDEQ, IBAL, ACUAVALLE...) y ademas exigia proximo_follow_up_fecha <= hoy, lo
// que ocultaba ~90% de los deals activos. Medicion real: Felipe tenia 24 activas y
// /seguimiento le mostraba 3. Un deal activo SIN fecha es justamente el que hay que ver
// para ponerle una.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { pipelineSinCadencia } = await import('./repository.ts');

function seedEmpresa(id: string, owner: string, estado: string, fecha: string | null) {
  const db = new Database(dbPath);
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                          estado_notion, proximo_follow_up_fecha, owner, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'lead', ?, ?, ?, 1)`,
  ).run(id, id, id.toLowerCase(), estado, fecha, owner);
  db.close();
}

const HOY = '2026-07-15';

test('solo trae las cuentas del owner pedido', () => {
  seedEmpresa('e-mia', 'Sebastian Acosta Molina', 'contacto_iniciado', '2026-07-01');
  seedEmpresa('e-de-thomas', 'Thomas Schumacher', 'lead', '2026-07-01');

  const ids = pipelineSinCadencia(1, HOY, 'Sebastian Acosta Molina').map((f) => f.idEmpresa);
  assert.ok(ids.includes('e-mia'));
  assert.ok(!ids.includes('e-de-thomas'), 'las cuentas de otro owner no salen');
});

test('un deal activo SIN fecha si sale (es el que hay que agendar)', () => {
  seedEmpresa('e-sin-fecha', 'Sebastian Acosta Molina', 'oportunidad', null);
  const ids = pipelineSinCadencia(1, HOY, 'Sebastian Acosta Molina').map((f) => f.idEmpresa);
  assert.ok(ids.includes('e-sin-fecha'));
});

test('un deal activo con fecha a FUTURO si sale', () => {
  seedEmpresa('e-futuro', 'Sebastian Acosta Molina', 'cierre_documentacion', '2026-08-30');
  const ids = pipelineSinCadencia(1, HOY, 'Sebastian Acosta Molina').map((f) => f.idEmpresa);
  assert.ok(ids.includes('e-futuro'));
});

test('on_hold y firma_pago siguen fuera (no son trabajo activo)', () => {
  seedEmpresa('e-hold', 'Sebastian Acosta Molina', 'on_hold', '2026-07-01');
  seedEmpresa('e-cliente', 'Sebastian Acosta Molina', 'firma_pago', '2026-07-01');
  const ids = pipelineSinCadencia(1, HOY, 'Sebastian Acosta Molina').map((f) => f.idEmpresa);
  assert.ok(!ids.includes('e-hold'));
  assert.ok(!ids.includes('e-cliente'));
});

test('esHoy y esVencido marcan la urgencia sin esconder nada', () => {
  seedEmpresa('e-vencida', 'Owner Marca', 'lead', '2026-07-01');
  seedEmpresa('e-hoy', 'Owner Marca', 'lead', HOY);
  seedEmpresa('e-nueva', 'Owner Marca', 'lead', null);

  const filas = pipelineSinCadencia(1, HOY, 'Owner Marca');
  const porId = new Map(filas.map((f) => [f.idEmpresa, f]));
  assert.equal(porId.get('e-vencida')!.esVencido, true);
  assert.equal(porId.get('e-hoy')!.esHoy, true);
  assert.equal(porId.get('e-nueva')!.esVencido, false);
  assert.equal(porId.get('e-nueva')!.esHoy, false);
});

test('excluye empresas en cadencia activa (esas van en las franjas de toque)', () => {
  const db = new Database(dbPath);
  db.prepare(`INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                          estado_notion, proximo_follow_up_fecha, owner, organizacion_activa_id)
     VALUES ('en-cadencia', 'nit', 'En Cadencia', 'en cadencia', 'lead', 'lead', '2026-06-01', 'Owner Marca', 1)`).run();
  db.prepare(`INSERT INTO cadencia (id_cadencia, nombre) VALUES (1, 'Cad')`).run();
  db.prepare(`INSERT INTO segmento (id_segmento, nombre, definicion, id_organizacion) VALUES (1, 'Seg', '{}', 1)`).run();
  db.prepare(`INSERT INTO campana (id_campana, nombre, id_cadencia, id_segmento, estado, id_organizacion) VALUES (1, 'Camp', 1, 1, 'activa', 1)`).run();
  db.prepare(`INSERT INTO inscripcion (id_inscripcion, id_campana, id_empresa, estado) VALUES (1, 1, 'en-cadencia', 'activa')`).run();
  db.close();

  const ids = pipelineSinCadencia(1, HOY, 'Owner Marca').map((f) => f.idEmpresa);
  assert.ok(!ids.includes('en-cadencia'));
});

test('respeta la organizacion', () => {
  seedEmpresa('e-otra-org', 'Owner Marca', 'lead', '2026-06-01');
  const db = new Database(dbPath);
  db.prepare(`UPDATE empresa SET organizacion_activa_id = 2 WHERE id_empresa = 'e-otra-org'`).run();
  db.close();

  const ids = pipelineSinCadencia(1, HOY, 'Owner Marca').map((f) => f.idEmpresa);
  assert.ok(!ids.includes('e-otra-org'));
});

// Fase 3 (CRO, docs/plan-produccion-cro-campana.md): sin owner (undefined) trae la
// franja "Sin cadencia" de TODOS los owners de la organizacion -- es la excepcion
// deliberada para Camilo. Organizacion 6, aislada del resto de este archivo.
test('sin owner (CRO) trae "Sin cadencia" de TODOS los owners, no solo uno', () => {
  seedEmpresa('cro-sebastian', 'Sebastian Acosta Molina', 'oportunidad', null);
  seedEmpresa('cro-felipe', 'Felipe Castro', 'contacto_iniciado', null);
  const db = new Database(dbPath);
  db.prepare(`UPDATE empresa SET organizacion_activa_id = 6 WHERE id_empresa IN ('cro-sebastian', 'cro-felipe')`).run();
  db.close();

  const ids = pipelineSinCadencia(6, HOY, undefined).map((f) => f.idEmpresa);
  assert.deepEqual(ids.sort(), ['cro-felipe', 'cro-sebastian']);
});

// Felipe y Sebastian se siguen viendo aislados: pasarles su propio owner (el camino
// normal, no CRO) sigue excluyendo al otro, aunque la funcion ahora acepte undefined.
test('con owner puntual, Felipe y Sebastian se siguen viendo aislados uno del otro', () => {
  seedEmpresa('aislado-sebastian', 'Sebastian Acosta Molina', 'oportunidad', null);
  seedEmpresa('aislado-felipe', 'Felipe Castro', 'contacto_iniciado', null);
  const db = new Database(dbPath);
  db.prepare(
    `UPDATE empresa SET organizacion_activa_id = 7 WHERE id_empresa IN ('aislado-sebastian', 'aislado-felipe')`,
  ).run();
  db.close();

  const idsSebastian = pipelineSinCadencia(7, HOY, 'Sebastian Acosta Molina').map((f) => f.idEmpresa);
  assert.deepEqual(idsSebastian, ['aislado-sebastian']);

  const idsFelipe = pipelineSinCadencia(7, HOY, 'Felipe Castro').map((f) => f.idEmpresa);
  assert.deepEqual(idsFelipe, ['aislado-felipe']);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
