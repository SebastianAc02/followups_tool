// app/db/repository.embudo.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { actualizarEstadoNotion } = await import('./repository.ts');

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
