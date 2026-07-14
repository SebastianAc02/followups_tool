// app/db/repository.embudo.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { actualizarEstadoNotion, embudoPipeline, historialEtapasEmpresa, listarOwnersEmpresa } = await import(
  './repository.ts'
);

function seedEmpresa(id: string, estado: string | null) {
  const raw = new Database(dbPath);
  raw.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'activo', ?, 1)`,
  ).run(id, id, id, estado);
  raw.close();
}

test('actualizarEstadoNotion: cambia la etapa y registra la transicion', () => {
  seedEmpresa('e1', 'lead');
  actualizarEstadoNotion('e1', 'contacto_iniciado', 1, '2026-07-13');

  const raw = new Database(dbPath);
  const emp = raw.prepare(`SELECT estado_notion FROM empresa WHERE id_empresa = 'e1'`).get() as { estado_notion: string };
  const hist = raw.prepare(`SELECT estado_anterior, estado_nuevo FROM empresa_estado_historial WHERE id_empresa = 'e1'`).get() as { estado_anterior: string; estado_nuevo: string };
  raw.close();

  assert.equal(emp.estado_notion, 'contacto_iniciado');
  assert.equal(hist.estado_anterior, 'lead');
  assert.equal(hist.estado_nuevo, 'contacto_iniciado');
});

test('actualizarEstadoNotion: no registra si la etapa no cambia', () => {
  seedEmpresa('e2', 'lead');
  actualizarEstadoNotion('e2', 'lead', 1, '2026-07-13');
  const raw = new Database(dbPath);
  const n = raw.prepare(`SELECT count(*) c FROM empresa_estado_historial WHERE id_empresa = 'e2'`).get() as { c: number };
  raw.close();
  assert.equal(n.c, 0);
});

test('embudoPipeline: agrupa por estado_notion, scoped a la organizacion, null aparte', () => {
  const raw = new Database(dbPath);
  const ins = raw.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'activo', ?, ?)`,
  );
  // Nombres de estado distintos a los usados en los tests de actualizarEstadoNotion
  // (arriba en este mismo archivo): la db de prueba es compartida entre todos los
  // tests del archivo (mismo dbPath, mismo modulo db singleton), asi que 'lead'/'e2'
  // ya tiene una fila viva de un test anterior. Usar 'lead_pipeline' evita el choque
  // sin depender del orden de ejecucion de los tests.
  ins.run('c1', 'c1', 'c1', 'lead_pipeline', 1);
  ins.run('c2', 'c2', 'c2', 'lead_pipeline', 1);
  ins.run('c3', 'c3', 'c3', 'on_hold_pipeline', 1);
  ins.run('c4', 'c4', 'c4', null, 1);
  ins.run('c5', 'c5', 'c5', 'lead_pipeline', 2); // otra organizacion: NO debe contar
  raw.close();

  const conteos = embudoPipeline(1);
  const byEstado = Object.fromEntries(conteos.map((c) => [c.estado, c.total]));
  assert.equal(byEstado['lead_pipeline'], 2);
  assert.equal(byEstado['on_hold_pipeline'], 1);
  assert.equal(byEstado['__sin_etapa__'], 1);
  // El assert anterior (lead_pipeline === 2, no 3) ya prueba que la fila de la
  // organizacion 2 no se colo en el conteo.
});

test('embudoPipeline: suma usuarios_efectivos por etapa (empresa_usuarios es 1:1)', () => {
  const raw = new Database(dbPath);
  raw.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'activo', ?, 1)`,
  ).run('u1', 'u1', 'u1', 'oportunidad');
  raw.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'activo', ?, 1)`,
  ).run('u2', 'u2', 'u2', 'oportunidad');
  raw.prepare(`INSERT INTO empresa_usuarios (id_empresa, usuarios_estimados, usuarios_efectivos) VALUES (?, ?, ?)`).run('u1', 100, 80);
  raw.prepare(`INSERT INTO empresa_usuarios (id_empresa, usuarios_estimados, usuarios_efectivos) VALUES (?, ?, ?)`).run('u2', 50, 40);
  raw.close();

  const conteos = embudoPipeline(1);
  const fila = conteos.find((c) => c.estado === 'oportunidad');
  assert.equal(fila?.total, 2);
  assert.equal(fila?.usuarios, 120);
});

test('embudoPipeline: filtro por owner cuenta solo las empresas de ese owner', () => {
  const raw = new Database(dbPath);
  const ins = raw.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id, owner)
     VALUES (?, 'nit', ?, ?, 'activo', ?, 1, ?)`,
  );
  ins.run('o1', 'o1', 'o1', 'owner_pipeline', 'sebastian');
  ins.run('o2', 'o2', 'o2', 'owner_pipeline', 'sebastian');
  ins.run('o3', 'o3', 'o3', 'owner_pipeline', 'camilo');
  raw.close();

  const conteos = embudoPipeline(1, { owner: 'sebastian' });
  const byEstado = Object.fromEntries(conteos.map((c) => [c.estado, c.total]));
  assert.equal(byEstado['owner_pipeline'], 2);
});

test('listarOwnersEmpresa: owners distintos de la organizacion, ordenados, sin nulls', () => {
  const raw = new Database(dbPath);
  const ins = raw.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id, owner)
     VALUES (?, 'nit', ?, ?, 'activo', 'owners_pipeline', 1, ?)`,
  );
  ins.run('lo1', 'lo1', 'lo1', 'zoe');
  ins.run('lo2', 'lo2', 'lo2', 'ana');
  ins.run('lo3', 'lo3', 'lo3', 'ana');
  ins.run('lo4', 'lo4', 'lo4', null);
  ins.run('lo5', 'lo5', 'lo5', 'otro_org'); // org distinta abajo
  raw.prepare(`UPDATE empresa SET organizacion_activa_id = 2 WHERE id_empresa = 'lo5'`).run();
  raw.close();

  const owners = listarOwnersEmpresa(1);
  assert.ok(owners.includes('ana'));
  assert.ok(owners.includes('zoe'));
  assert.ok(!owners.includes('otro_org'));
  assert.deepEqual(owners, [...owners].sort());
});

test('historialEtapasEmpresa: devuelve etapa actual + transiciones ordenadas', () => {
  seedEmpresa('h1', 'reunion_agendada');
  actualizarEstadoNotion('h1', 'oportunidad', 1, '2026-07-10');
  actualizarEstadoNotion('h1', 'cierre_documentacion', 1, '2026-07-12');

  const r = historialEtapasEmpresa('h1', 1);
  assert.equal(r.etapaActual, 'cierre_documentacion');
  assert.equal(r.transiciones.length, 2);
  assert.equal(r.transiciones[0].estado, 'oportunidad'); // mas antigua primero
  assert.equal(r.transiciones[0].fecha, '2026-07-10');
  assert.equal(r.transiciones[1].estado, 'cierre_documentacion');
});
