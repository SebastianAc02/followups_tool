// app/db/repository.cockpitCro.test.ts
// Fase 4 (plan-produccion-cro-campana.md): las agregaciones nuevas del cockpit del CRO.
// Los calculos puros (calcularDuracionPorEtapa, calcularCicloVenta, calcularMrrEstimado,
// calcularVelocidadCambioEtapa, probabilidadCierrePorEtapa) ya tienen su suite en core/;
// esto prueba la parte que SI toca DB real: el join/agrupado por empresa,
// EMPRESA_VIVA/EN_PIPELINE, y el scoping por organizacion (mismo patron que
// repository.embudo.test.ts).
//
// Cada test usa su PROPIO idOrganizacion (numeros altos, sin repetir entre tests): estas
// funciones agregan sobre TODA la organizacion, asi que si dos tests compartieran
// organizacion, la data de uno se sumaria silenciosamente al promedio/total del otro (se
// encontro en vivo: reusar organizacion 1 en varios tests daba numeros que no cuadraban
// con lo que cada test sembraba). embudo.test.ts evita esto con prefijos de estado unicos
// porque ahi la organizacion SI se reusa a proposito para probar el filtro; aca aislar por
// organizacion es mas simple y mas dificil de romper por accidente despues.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const {
  actualizarEstadoNotion,
  duracionPromedioPorEtapa,
  cicloVentaPromedio,
  transicionesEnRango,
  mrrEstimadoTotal,
  pipelineParaEndpoint,
  ETAPAS_TIEMPO_PANEL,
} = await import('./repository.ts');

function seedEmpresa(id: string, estado: string | null, idOrganizacion: number, opciones?: { operaBajoId?: string }) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id, notion_page_id, opera_bajo_id)
       VALUES (?, 'nit', ?, ?, 'activo', ?, ?, ?, ?)`,
    )
    .run(id, id, id, estado, idOrganizacion, `ntn-${id}`, opciones?.operaBajoId ?? null);
  raw.close();
}

function seedUsuarios(idEmpresa: string, usuariosEfectivos: number) {
  const raw = new Database(dbPath);
  raw
    .prepare(`INSERT INTO empresa_usuarios (id_empresa, usuarios_estimados, usuarios_efectivos) VALUES (?, ?, ?)`)
    .run(idEmpresa, usuariosEfectivos, usuariosEfectivos);
  raw.close();
}

test('ETAPAS_TIEMPO_PANEL: las 3 etapas que pide el plan (metrica 1)', () => {
  assert.deepEqual([...ETAPAS_TIEMPO_PANEL], ['contacto_iniciado', 'reunion_agendada', 'cierre_documentacion']);
});

test('duracionPromedioPorEtapa: promedia dias por etapa sobre varias empresas', () => {
  const ORG = 1001;
  seedEmpresa('cro1', 'lead', ORG);
  actualizarEstadoNotion('cro1', 'contacto_iniciado', ORG, '2026-06-01');
  actualizarEstadoNotion('cro1', 'reunion_agendada', ORG, '2026-06-05'); // 4 dias en contacto_iniciado

  seedEmpresa('cro2', 'lead', ORG);
  actualizarEstadoNotion('cro2', 'contacto_iniciado', ORG, '2026-06-01');
  actualizarEstadoNotion('cro2', 'reunion_agendada', ORG, '2026-06-03'); // 2 dias en contacto_iniciado

  const resultado = duracionPromedioPorEtapa(ORG, '2026-06-10');
  assert.equal(resultado['contacto_iniciado'], 3); // (4+2)/2
});

test('duracionPromedioPorEtapa: una empresa opera_bajo_id (fusionada/muerta) no cuenta', () => {
  const ORG = 1002;
  seedEmpresa('cro3', 'lead', ORG);
  actualizarEstadoNotion('cro3', 'contacto_iniciado', ORG, '2026-06-01'); // abierta, 10 dias contra "ahora"

  // cro4 arranca mucho antes: si se colara en el promedio, el numero se dispararia muy
  // por encima de 10 -- a diferencia de darle la MISMA fecha (que no distinguiria nada).
  seedEmpresa('cro4', 'lead', ORG, { operaBajoId: 'cro3' });
  actualizarEstadoNotion('cro4', 'contacto_iniciado', ORG, '2026-01-01');

  const resultado = duracionPromedioPorEtapa(ORG, '2026-06-11', ['contacto_iniciado']);
  assert.equal(resultado['contacto_iniciado'], 10);
});

test('duracionPromedioPorEtapa: sin historial en la organizacion devuelve objeto vacio (sin_datos), no un 0 inventado', () => {
  const resultado = duracionPromedioPorEtapa(1099, '2026-06-10');
  assert.deepEqual(resultado, {});
});

test('cicloVentaPromedio: promedia solo las empresas que llegaron a firma_pago', () => {
  const ORG = 1003;
  seedEmpresa('cv1', 'lead', ORG);
  actualizarEstadoNotion('cv1', 'contacto_iniciado', ORG, '2026-01-01');
  actualizarEstadoNotion('cv1', 'firma_pago', ORG, '2026-01-11'); // ciclo de 10 dias

  seedEmpresa('cv2', 'lead', ORG);
  actualizarEstadoNotion('cv2', 'contacto_iniciado', ORG, '2026-02-01'); // sigue abierto, no cuenta

  const promedio = cicloVentaPromedio(ORG, '2026-03-01');
  assert.equal(promedio, 10);
});

test('cicloVentaPromedio: ninguna empresa cerro -- null, no 0', () => {
  const promedio = cicloVentaPromedio(1098, '2026-03-01');
  assert.equal(promedio, null);
});

test('transicionesEnRango: cuenta transiciones dentro del rango, scoped a organizacion', () => {
  const ORG_A = 1004;
  const ORG_B = 1005;
  seedEmpresa('tr1', 'lead', ORG_A);
  actualizarEstadoNotion('tr1', 'contacto_iniciado', ORG_A, '2026-05-01');
  actualizarEstadoNotion('tr1', 'reunion_agendada', ORG_A, '2026-05-10');
  actualizarEstadoNotion('tr1', 'oportunidad', ORG_A, '2026-06-01'); // fuera del rango de abajo

  seedEmpresa('tr2', 'lead', ORG_B); // otra organizacion, no debe contar
  actualizarEstadoNotion('tr2', 'contacto_iniciado', ORG_B, '2026-05-05');

  const n = transicionesEnRango(ORG_A, '2026-05-01', '2026-05-31');
  assert.equal(n, 2);
});

test('mrrEstimadoTotal: suma usuarios x digital(100%) x tarifa + saas por empresa en pipeline', () => {
  const ORG = 1006;
  seedEmpresa('mrr1', 'oportunidad', ORG);
  seedUsuarios('mrr1', 100);
  seedEmpresa('mrr2', 'oportunidad', ORG);
  seedUsuarios('mrr2', 50);

  const total = mrrEstimadoTotal(ORG, 200, 10000);
  // (100*1*200 + 10000) + (50*1*200 + 10000) = 30000 + 20000 = 50000
  assert.equal(total, 50000);
});

test('mrrEstimadoTotal: empresa sin fila en empresa_usuarios cuenta como 0 usuarios, no revienta', () => {
  const ORG = 1007;
  seedEmpresa('mrr3', 'oportunidad', ORG);
  const total = mrrEstimadoTotal(ORG, 200, 10000);
  assert.equal(total, 10000); // solo el saas fijo, 0 usuarios
});

test('pipelineParaEndpoint: trae idEmpresa/nombre/estado/usuarios, scoped a organizacion y EMPRESA_VIVA', () => {
  const ORG = 1008;
  const OTRA_ORG = 1009;
  seedEmpresa('pe1', 'reunion_agendada', ORG);
  seedUsuarios('pe1', 40);
  seedEmpresa('pe2', 'reunion_agendada', ORG, { operaBajoId: 'pe1' }); // fusionada, no debe salir
  seedEmpresa('pe3', 'reunion_agendada', OTRA_ORG); // otra organizacion, no debe salir

  const filas = pipelineParaEndpoint(ORG);
  const ids = filas.map((f) => f.idEmpresa);
  assert.ok(ids.includes('pe1'));
  assert.ok(!ids.includes('pe2'));
  assert.ok(!ids.includes('pe3'));

  const pe1 = filas.find((f) => f.idEmpresa === 'pe1');
  assert.equal(pe1?.estado, 'reunion_agendada');
  assert.equal(pe1?.usuariosEfectivos, 40);
});
