// write-path del MCP (2026-07-24, integraciones/propuesta-write-path.md): marcarPerdida es
// el camino de dominio para "parquear/perder" una cuenta (razon_perdida + estado on_hold),
// que hoy no tenia camino limpio desde la tool (docs/operar-data.md Recetas 2 y 4). A
// diferencia de un toque normal, una perdida NO gradua la etapa (no pasa por
// estadoDestinoPorToque): on_hold es el destino, no un avance.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { marcarPerdida, outboxPendientes } = await import('./repository.ts');

function seedEmpresa(id: string, estado: string | null, notionPageId: string | null = null) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id, notion_page_id)
       VALUES (?, 'nit', ?, ?, 'activo', ?, 1, ?)`,
    )
    .run(id, id, id, estado, notionPageId);
  raw.close();
}

function leer(id: string) {
  const raw = new Database(dbPath);
  const emp = raw.prepare(`SELECT estado_notion FROM empresa WHERE id_empresa = ?`).get(id) as { estado_notion: string | null };
  const toques = raw.prepare(`SELECT canal, resultado, razon_perdida FROM toque WHERE id_empresa = ? ORDER BY id_toque`).all(id) as any[];
  const historial = raw.prepare(`SELECT estado_anterior, estado_nuevo FROM empresa_estado_historial WHERE id_empresa = ? ORDER BY id`).all(id) as any[];
  raw.close();
  return { estado: emp.estado_notion, toques, historial };
}

test('marcarPerdida escribe el toque de perdida (contesto_no + razon_perdida) y pone la empresa on_hold', () => {
  seedEmpresa('mp1', 'oportunidad');
  marcarPerdida({ idEmpresa: 'mp1', canal: 'llamada', razonPerdida: 'precio muy alto' }, 1);

  const { estado, toques, historial } = leer('mp1');
  assert.equal(estado, 'on_hold');
  assert.equal(toques.length, 1);
  assert.equal(toques[0].resultado, 'contesto_no');
  assert.equal(toques[0].razon_perdida, 'precio muy alto');
  assert.equal(historial.length, 1);
  assert.equal(historial[0].estado_anterior, 'oportunidad');
  assert.equal(historial[0].estado_nuevo, 'on_hold');
});

test('marcarPerdida NO gradua la etapa: una empresa on_hold no vuelve a contacto_iniciado (no pasa por estadoDestinoPorToque)', () => {
  seedEmpresa('mp2', 'on_hold');
  marcarPerdida({ idEmpresa: 'mp2', canal: 'whatsapp', razonPerdida: 'ya tiene proveedor' }, 1);

  const { estado, historial } = leer('mp2');
  assert.equal(estado, 'on_hold'); // sigue on_hold, NO graduo a contacto_iniciado
  assert.equal(historial.length, 0, 'ya estaba on_hold: no se registra una transicion redundante');
});

test('marcarPerdida encola estado + razonPerdida al outbox cuando la empresa tiene notion_page_id', () => {
  seedEmpresa('mp3', 'oportunidad', 'page-mp3');
  marcarPerdida({ idEmpresa: 'mp3', canal: 'llamada', razonPerdida: 'no hay presupuesto' }, 1);

  const fila = outboxPendientes().find((p) => p.payload.notionPageId === 'page-mp3');
  assert.ok(fila, 'debe haber una fila de outbox para la empresa');
  assert.equal(fila!.payload.estado, 'on_hold');
  assert.equal(fila!.payload.razonPerdida, 'no hay presupuesto');
});

test('marcarPerdida exige razonPerdida (Zod): sin ella, lanza', () => {
  seedEmpresa('mp4', 'oportunidad');
  assert.throws(() => marcarPerdida({ idEmpresa: 'mp4', canal: 'llamada', razonPerdida: '' } as any, 1));
});

test('marcarPerdida respeta el guard de organizacion: no toca una empresa de otra org', () => {
  seedEmpresa('mp5', 'oportunidad');
  assert.throws(() => marcarPerdida({ idEmpresa: 'mp5', canal: 'llamada', razonPerdida: 'x' }, 999), /otra organizacion|no existe/);
});

test.after(() => borrarDbPrueba(dbPath));
