// app/db/repository.datosFinancieros.test.ts
// Fase 1 punto 4 + Fase 2 (plan-panel-metricas-tiempo-real.md): captura de plan/%digital
// en la ficha del deal (listarPlanes, asignarPlanEmpresa, actualizarPctDigitalEmpresa) y
// la cara financiera cruda que perfilPipelineEmpresa le suma a la ficha (DetallePanel).
// Los calculos (calcularMrrEstimado, digitalPctConDefault, probabilidadCierrePorEtapa) ya
// tienen su propia suite en core/ -- esto prueba solo lo que toca DB real: el catalogo, el
// guard de organizacion, y que perfilPipelineEmpresa devuelva los crudos correctos (sin
// aplicar ninguna formula, eso es del caller).
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { listarPlanes, asignarPlanEmpresa, actualizarPctDigitalEmpresa, perfilPipelineEmpresa } = await import('./repository.ts');

function seedEmpresa(id: string, idOrganizacion = 1) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id)
       VALUES (?, 'nit', ?, ?, 'activo', 'oportunidad', ?)`,
    )
    .run(id, id, id, idOrganizacion);
  raw.close();
}

function seedPlan(nombre: string, saasMensual: number, tarifaTxn: number): number {
  const raw = new Database(dbPath);
  const info = raw.prepare(`INSERT INTO plan (nombre, saas_mensual, tarifa_txn) VALUES (?, ?, ?)`).run(nombre, saasMensual, tarifaTxn);
  raw.close();
  return Number(info.lastInsertRowid);
}

function seedUsuarios(idEmpresa: string, usuariosEstimados: number, usuariosEfectivos?: number) {
  const raw = new Database(dbPath);
  raw
    .prepare(`INSERT INTO empresa_usuarios (id_empresa, usuarios_estimados, usuarios_efectivos) VALUES (?, ?, ?)`)
    .run(idEmpresa, usuariosEstimados, usuariosEfectivos ?? usuariosEstimados);
  raw.close();
}

test('listarPlanes: trae el catalogo ordenado por nombre', () => {
  seedPlan('Zeta', 1, 1);
  seedPlan('Alfa', 2, 2);

  const planes = listarPlanes();
  const nombres = planes.map((p) => p.nombre);
  // orden alfabetico: Alfa antes que Zeta, sin importar el orden de insercion
  assert.ok(nombres.indexOf('Alfa') < nombres.indexOf('Zeta'));
});

test('asignarPlanEmpresa: escribe id_plan cuando el lead es de la organizacion que llama', () => {
  seedEmpresa('fin-1', 1);
  const idPlan = seedPlan('Essential', 600_000, 2_200);

  asignarPlanEmpresa('fin-1', 1, idPlan);

  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT id_plan FROM empresa WHERE id_empresa = ?').get('fin-1') as any;
  assert.equal(fila.id_plan, idPlan);
  raw.close();
});

test('asignarPlanEmpresa: null quita el plan asignado', () => {
  seedEmpresa('fin-2', 1);
  const idPlan = seedPlan('Pro', 1_800_000, 1_680);
  asignarPlanEmpresa('fin-2', 1, idPlan);

  asignarPlanEmpresa('fin-2', 1, null);

  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT id_plan FROM empresa WHERE id_empresa = ?').get('fin-2') as any;
  assert.equal(fila.id_plan, null);
  raw.close();
});

test('asignarPlanEmpresa: rechaza un id_plan que no existe en el catalogo (no deja una FK huerfana)', () => {
  seedEmpresa('fin-3', 1);
  assert.throws(() => asignarPlanEmpresa('fin-3', 1, 999999), /no existe en el catalogo/i);
});

test('asignarPlanEmpresa: rechaza si el lead esta activo en otra organizacion', () => {
  seedEmpresa('fin-4', 2);
  const idPlan = seedPlan('Growth', 5_500_000, 1_000);
  assert.throws(() => asignarPlanEmpresa('fin-4', 1, idPlan), /organizacion/i);
});

test('actualizarPctDigitalEmpresa: escribe pct_digital 0..1', () => {
  seedEmpresa('fin-5', 1);
  actualizarPctDigitalEmpresa('fin-5', 1, 0.35);

  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT pct_digital FROM empresa WHERE id_empresa = ?').get('fin-5') as any;
  assert.equal(fila.pct_digital, 0.35);
  raw.close();
});

test('actualizarPctDigitalEmpresa: null borra el dato capturado (el caller vuelve al default 40%)', () => {
  seedEmpresa('fin-6', 1);
  actualizarPctDigitalEmpresa('fin-6', 1, 0.5);
  actualizarPctDigitalEmpresa('fin-6', 1, null);

  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT pct_digital FROM empresa WHERE id_empresa = ?').get('fin-6') as any;
  assert.equal(fila.pct_digital, null);
  raw.close();
});

test('actualizarPctDigitalEmpresa: rechaza valores fuera de 0..1', () => {
  seedEmpresa('fin-7', 1);
  assert.throws(() => actualizarPctDigitalEmpresa('fin-7', 1, 1.5), /entre 0 y 1/i);
  assert.throws(() => actualizarPctDigitalEmpresa('fin-7', 1, -0.1), /entre 0 y 1/i);
});

test('actualizarPctDigitalEmpresa: rechaza si el lead esta activo en otra organizacion', () => {
  seedEmpresa('fin-8', 2);
  assert.throws(() => actualizarPctDigitalEmpresa('fin-8', 1, 0.4), /organizacion/i);
});

test('perfilPipelineEmpresa: sin plan asignado, plan es null y pctDigital/usuarios quedan crudos', () => {
  seedEmpresa('fin-9', 1);
  seedUsuarios('fin-9', 500);

  const perfil = perfilPipelineEmpresa('fin-9', 1);
  assert.equal(perfil?.plan, null);
  assert.equal(perfil?.pctDigital, null); // sin capturar -- el caller aplica el default 40%
  assert.equal(perfil?.usuariosEstimados, 500);
  assert.equal(perfil?.usuariosEfectivos, 500);
});

test('perfilPipelineEmpresa: con plan asignado, trae nombre/saas/tarifa del plan real (no de configuracion_admin)', () => {
  seedEmpresa('fin-10', 1);
  const idPlan = seedPlan('Utilities Enterprise', 20_000_000, 200);
  asignarPlanEmpresa('fin-10', 1, idPlan);
  actualizarPctDigitalEmpresa('fin-10', 1, 0.6);
  seedUsuarios('fin-10', 1000);

  const perfil = perfilPipelineEmpresa('fin-10', 1);
  assert.deepEqual(perfil?.plan, { id: idPlan, nombre: 'Utilities Enterprise', saasMensual: 20_000_000, tarifaTxn: 200 });
  assert.equal(perfil?.pctDigital, 0.6);
  assert.equal(perfil?.usuariosEstimados, 1000);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
