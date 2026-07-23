// Pruebas de composicion de las tools del MCP (Fase 3). No entran por HTTP ni por un
// cliente MCP (eso lo cubre server.test.ts) -- llaman panelMetricas/dealHistoria/pipeline
// directo, mismo patron que repository.widgetsConectados.test.ts: DB de archivo (no
// :memory:) para que la conexion cruda de seed y la de Drizzle (via db/index.ts) vean los
// mismos datos, con ISPS_DB_PATH seteado ANTES de importar el modulo bajo prueba.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { panelMetricas, dealHistoria, pipeline } = await import('./tools.ts');
const { actualizarEstadoNotion } = await import('../db/repository.ts');

function seedEmpresa(id: string, estado: string | null, idOrganizacion: number, idPlan?: number, pctDigital?: number) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id, notion_page_id, id_plan, pct_digital)
       VALUES (?, 'nit', ?, ?, 'activo', ?, ?, ?, ?, ?)`,
    )
    .run(id, id, id, estado, idOrganizacion, `ntn-${id}`, idPlan ?? null, pctDigital ?? null);
  raw.close();
}

function seedPlan(nombre: string, saasMensual: number, tarifaTxn: number): number {
  const raw = new Database(dbPath);
  const r = raw.prepare(`INSERT INTO plan (nombre, saas_mensual, tarifa_txn) VALUES (?, ?, ?)`).run(nombre, saasMensual, tarifaTxn);
  raw.close();
  return Number(r.lastInsertRowid);
}

function seedUsuarios(idEmpresa: string, usuariosEfectivos: number) {
  const raw = new Database(dbPath);
  raw.prepare(`INSERT INTO empresa_usuarios (id_empresa, usuarios_efectivos) VALUES (?, ?)`).run(idEmpresa, usuariosEfectivos);
  raw.close();
}

test('panelMetricas: trae las 4 cifras con la forma esperada', () => {
  const ORG = 8001;
  seedEmpresa('pm1', 'lead', ORG);
  actualizarEstadoNotion('pm1', 'contacto_iniciado', ORG, '2026-06-01');
  actualizarEstadoNotion('pm1', 'reunion_agendada', ORG, '2026-06-05');

  const r = panelMetricas({ idOrganizacion: ORG, ahora: '2026-07-23' });

  assert.equal(r.organizacion, ORG);
  assert.equal(typeof r.tiempoPromedioPorEtapa, 'object');
  assert.ok(r.tiempoPromedioPorEtapa.contacto_iniciado > 0);
  assert.equal(r.cicloVentaPromedio, null); // nadie llego a firma_pago
  // pm1 llego (high-water-mark) hasta reunion_agendada: los dos primeros pares dan 1,
  // el tercero (hacia oportunidad, nunca alcanzada) da 0 explicito -- no se omite porque
  // SI hubo un deal en reunion_agendada (denominador != 0).
  assert.deepEqual(r.conversionStage, {
    'lead→contacto_iniciado': 1,
    'contacto_iniciado→reunion_agendada': 1,
    'reunion_agendada→oportunidad': 0,
  });
});

test('panelMetricas: conversionStage refleja el orden real de FUNNEL_ETAPAS', () => {
  const ORG = 8002;
  seedEmpresa('pm2', 'contacto_iniciado', ORG);

  const r = panelMetricas({ idOrganizacion: ORG, ahora: '2026-07-23' });
  assert.deepEqual(r.conversionStage, {
    'lead→contacto_iniciado': 1,
    'contacto_iniciado→reunion_agendada': 0,
  });
});

test('panelMetricas: owner filtra SOLO conversionStage, no las otras 3', () => {
  const ORG = 8003;
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id, notion_page_id, owner)
       VALUES ('pm3a', 'nit', 'pm3a', 'pm3a', 'activo', 'oportunidad', ?, 'ntn-pm3a', 'Felipe Castro')`,
    )
    .run(ORG);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id, notion_page_id, owner)
       VALUES ('pm3b', 'nit', 'pm3b', 'pm3b', 'activo', 'lead', ?, 'ntn-pm3b', 'Thomas Schumacher')`,
    )
    .run(ORG);
  raw.close();

  const sinOwner = panelMetricas({ idOrganizacion: ORG, ahora: '2026-07-23' });
  const conOwner = panelMetricas({ idOrganizacion: ORG, owner: 'Felipe Castro', ahora: '2026-07-23' });

  assert.equal(sinOwner.mrrEstimadoTotal, conOwner.mrrEstimadoTotal); // sin dato de plan, ambos 0 -- lo que importa es que no truena
  assert.deepEqual(sinOwner.tiempoPromedioPorEtapa, conOwner.tiempoPromedioPorEtapa);
  assert.notDeepEqual(sinOwner.conversionStage, conOwner.conversionStage);
});

test('dealHistoria: empresa que no existe (o fuera del scope de pipelineParaEndpoint) da error explicito', () => {
  const r = dealHistoria({ idEmpresa: 'no-existe', idOrganizacion: 8004 });
  assert.deepEqual(r, { idEmpresa: 'no-existe', error: 'empresa_no_encontrada' });
});

test('dealHistoria: con plan asignado devuelve mrrPotencial real, transiciones y probabilidad', () => {
  const ORG = 8005;
  const idPlan = seedPlan('Pro', 1_800_000, 1680);
  seedEmpresa('dh1', 'lead', ORG, idPlan, 0.4);
  seedUsuarios('dh1', 4000);
  actualizarEstadoNotion('dh1', 'contacto_iniciado', ORG, '2026-06-01');
  actualizarEstadoNotion('dh1', 'oportunidad', ORG, '2026-06-10');

  const r = dealHistoria({ idEmpresa: 'dh1', idOrganizacion: ORG });
  assert.equal('error' in r, false);
  if ('error' in r) return; // guard de tipos

  assert.equal(r.idEmpresa, 'dh1');
  assert.equal(r.etapaActual, 'oportunidad');
  assert.equal(r.transiciones.length, 2);
  assert.equal(r.plan, 'Pro');
  // 4000 * 0.4 * 1680 + 1_800_000 = 4_488_000 (mismo numero verificado contra Notion, ver mrr.ts)
  assert.equal(r.mrrPotencial, 4_488_000);
  assert.equal(r.digitalPct, 0.4);
  assert.equal(r.metodoProbabilidad, 'heuristica_por_etapa');
  assert.equal(r.usuariosEfectivos, 4000);
});

test('dealHistoria: SIN plan asignado, mrrPotencial es null (no se inventa una tarifa)', () => {
  const ORG = 8006;
  seedEmpresa('dh2', 'lead', ORG);

  const r = dealHistoria({ idEmpresa: 'dh2', idOrganizacion: ORG });
  assert.equal('error' in r, false);
  if ('error' in r) return;
  assert.equal(r.plan, null);
  assert.equal(r.mrrPotencial, null);
  assert.equal(r.digitalPct, 0.4); // default cuando pct_digital es null
});

test('pipeline: lista los deals de la organizacion con revenueEstimado null sin plan y real con plan', () => {
  const ORG = 8007;
  const idPlan = seedPlan('Essential', 600_000, 2200);
  seedEmpresa('pl1', 'oportunidad', ORG, idPlan, 0.4);
  seedUsuarios('pl1', 1000);
  seedEmpresa('pl2', 'lead', ORG); // sin plan

  const r = pipeline({ idOrganizacion: ORG });
  assert.equal(r.organizacion, ORG);
  assert.equal(r.empresas.length, 2);

  const conPlan = r.empresas.find((e) => e.idEmpresa === 'pl1')!;
  const sinPlan = r.empresas.find((e) => e.idEmpresa === 'pl2')!;
  assert.equal(conPlan.plan, 'Essential');
  // 1000 * 0.4 * 2200 + 600_000 = 1_480_000
  assert.equal(conPlan.revenueEstimado, 1_480_000);
  assert.equal(sinPlan.plan, null);
  assert.equal(sinPlan.revenueEstimado, null);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
