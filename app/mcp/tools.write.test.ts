// write-path del MCP (2026-07-24, integraciones/propuesta-write-path.md). Dos niveles:
//  1) las funciones wrapper (registrarToqueTool/moverEstadoTool/cambiarCadenciaTool/
//     marcarPerdidaTool) escriben de verdad contra la DB via el dominio -- mismo patron de
//     prueba que tools.test.ts (DB de archivo, ISPS_DB_PATH antes de importar el modulo).
//  2) el gating de registro: crearMcpServer({escritura:true}) expone las 4 write tools;
//     crearMcpServer() (default, server standalone legacy) NO las expone -- solo lectura.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { registrarToqueTool, moverEstadoTool, cambiarCadenciaTool, marcarPerdidaTool } = await import('./tools.ts');
const { crearMcpServer } = await import('./server.ts');
const { outboxPendientes } = await import('../db/repository.ts');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

function seedEmpresa(id: string, estado: string, notionPageId: string | null = null) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id, notion_page_id)
       VALUES (?, 'nit', ?, ?, 'activo', ?, 1, ?)`,
    )
    .run(id, id, id, estado, notionPageId);
  raw.close();
}

test('registrarToqueTool escribe el toque via el dominio y encola outbox', () => {
  seedEmpresa('w1', 'contacto_iniciado', 'page-w1');
  registrarToqueTool({ idEmpresa: 'w1', canal: 'llamada', resultado: 'contesto_sigue_seguimiento', quePaso: 'quedamos en hablar', proximoFollowUp: '2026-08-01' } as any, 1);

  const raw = new Database(dbPath);
  const t = raw.prepare(`SELECT canal, resultado, que_paso FROM toque WHERE id_empresa = 'w1'`).get() as any;
  raw.close();
  assert.equal(t.resultado, 'contesto_sigue_seguimiento');
  assert.equal(t.que_paso, 'quedamos en hablar');

  const fila = outboxPendientes().find((p) => p.payload.notionPageId === 'page-w1');
  assert.ok(fila);
  assert.equal(fila!.payload.proximoPaso, 'quedamos en hablar');
});

test('moverEstadoTool con origen herramienta mueve la etapa y encola el estado al outbox (DB->Notion)', () => {
  seedEmpresa('w2', 'contacto_iniciado', 'page-w2');
  moverEstadoTool({ idEmpresa: 'w2', estado: 'oportunidad', fecha: '2026-07-24', origen: 'herramienta' }, 1);

  const raw = new Database(dbPath);
  const e = raw.prepare(`SELECT estado_notion FROM empresa WHERE id_empresa = 'w2'`).get() as any;
  raw.close();
  assert.equal(e.estado_notion, 'oportunidad');

  const fila = outboxPendientes().find((p) => p.payload.notionPageId === 'page-w2');
  assert.ok(fila);
  assert.equal(fila!.payload.estado, 'oportunidad');
});

// El caso de la reconciliacion: el estado ya estaba en Notion, la DB venia atrasada. Escribir la
// etapa SI, devolverla a Notion NO. Sin esto el sync rebota (Notion -> DB -> Notion) y termina
// escribiendo sobre el CRM de otra persona un valor que esa persona ya tenia.
test('moverEstadoTool con origen notion mueve la etapa y NO encola nada al outbox', () => {
  seedEmpresa('w2b', 'contacto_iniciado', 'page-w2b');
  moverEstadoTool({ idEmpresa: 'w2b', estado: 'oportunidad', fecha: '2026-07-25', origen: 'notion' }, 1);

  const raw = new Database(dbPath);
  const e = raw.prepare(`SELECT estado_notion FROM empresa WHERE id_empresa = 'w2b'`).get() as any;
  raw.close();
  assert.equal(e.estado_notion, 'oportunidad');

  assert.equal(outboxPendientes().find((p) => p.payload.notionPageId === 'page-w2b'), undefined);
});

// Default: sin origen tampoco encola. Hoy nada sale hacia Notion de forma automatica.
test('moverEstadoTool sin origen NO encola', () => {
  seedEmpresa('w2c', 'contacto_iniciado', 'page-w2c');
  moverEstadoTool({ idEmpresa: 'w2c', estado: 'oportunidad', fecha: '2026-07-25' }, 1);

  assert.equal(outboxPendientes().find((p) => p.payload.notionPageId === 'page-w2c'), undefined);
});

test('cambiarCadenciaTool reprograma el seguimiento', () => {
  seedEmpresa('w3', 'contacto_iniciado');
  cambiarCadenciaTool({ idEmpresa: 'w3', proximoFollowUp: '2026-08-15', proximoPaso: 'reintentar' } as any, 1);

  const raw = new Database(dbPath);
  const e = raw.prepare(`SELECT proximo_follow_up_fecha, proximo_paso FROM empresa WHERE id_empresa = 'w3'`).get() as any;
  raw.close();
  assert.equal(e.proximo_follow_up_fecha, '2026-08-15');
  assert.equal(e.proximo_paso, 'reintentar');
});

test('marcarPerdidaTool pone la empresa on_hold y registra la razon', () => {
  seedEmpresa('w4', 'oportunidad');
  marcarPerdidaTool({ idEmpresa: 'w4', canal: 'llamada', razonPerdida: 'eligio a otro' } as any, 1);

  const raw = new Database(dbPath);
  const e = raw.prepare(`SELECT estado_notion FROM empresa WHERE id_empresa = 'w4'`).get() as any;
  const t = raw.prepare(`SELECT resultado, razon_perdida FROM toque WHERE id_empresa = 'w4'`).get() as any;
  raw.close();
  assert.equal(e.estado_notion, 'on_hold');
  assert.equal(t.resultado, 'contesto_no');
  assert.equal(t.razon_perdida, 'eligio a otro');
});

// La organizacion la fija la sesion, no el cliente: un idOrganizacion equivocado no escribe.
test('las write tools respetan el guard de organizacion de la sesion', () => {
  seedEmpresa('w5', 'oportunidad');
  assert.throws(() => marcarPerdidaTool({ idEmpresa: 'w5', canal: 'llamada', razonPerdida: 'x' } as any, 999));
});

async function toolsDe(server: any): Promise<string[]> {
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(c);
  const { tools } = await client.listTools();
  await client.close();
  return tools.map((t: any) => t.name).sort();
}

// buscar_empresa entra a esta lista y NO a la de escritura a proposito: no escribe nada, y
// es la que responde "esta cuenta ya existe?". Un lector sin escritura_mcp tiene que poder
// preguntarlo.
test('crearMcpServer() (default, standalone legacy) expone SOLO las tools de lectura', async () => {
  const nombres = await toolsDe(crearMcpServer());
  assert.deepEqual(nombres, ['buscar_empresa', 'cuentas', 'deal_historia', 'embudo', 'panel_metricas', 'pipeline']);
});

test('crearMcpServer({escritura:true}) expone ademas las 6 write tools', async () => {
  const nombres = await toolsDe(crearMcpServer({ escritura: true, idOrganizacion: 1 }));
  assert.deepEqual(nombres, [
    'actualizar_empresa',
    'buscar_empresa',
    'cambiar_cadencia',
    'crear_empresa',
    'cuentas',
    'deal_historia',
    'embudo',
    'marcar_perdida',
    'mover_estado',
    'panel_metricas',
    'pipeline',
    'registrar_toque',
  ]);
});

// El contrapositivo del test de arriba, escrito aparte porque es la garantia que importa:
// ninguna de las que escriben aparece sin el permiso.
test('sin escritura_mcp no se lista NINGUNA tool que escriba', async () => {
  const nombres = await toolsDe(crearMcpServer());
  for (const escritora of ['registrar_toque', 'mover_estado', 'cambiar_cadencia', 'marcar_perdida', 'crear_empresa', 'actualizar_empresa']) {
    assert.equal(nombres.includes(escritora), false, `${escritora} no debe listarse sin el permiso`);
  }
});

test.after(() => borrarDbPrueba(dbPath));
