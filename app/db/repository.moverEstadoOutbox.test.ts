// write-path del MCP (2026-07-24, integraciones/propuesta-write-path.md): mover_estado usa
// actualizarEstadoNotion con encolarNotion:true para que el cambio de etapa viaje DB ->
// Notion (antes estado solo iba Notion -> DB, ver docs/operar-data.md Receta 2). El caller
// del sync (scripts/sync_estados_notion.ts) NO debe encolar (bounce-back Notion->DB->Notion):
// por eso el default es sin encolar.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba, encenderEncoladoNotion } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;
// La compuerta del encolado a Notion nace APAGADA en produccion (2026-07-26). Este archivo
// prueba el lado ENCENDIDO, asi que la abre explicitamente; el lado apagado tiene su propio
// archivo (repository.compuertaOutbox.test.ts).
encenderEncoladoNotion(dbPath);

const { actualizarEstadoNotion, outboxPendientes } = await import('./repository.ts');

function seedEmpresa(id: string, estado: string, notionPageId: string | null) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id, notion_page_id)
       VALUES (?, 'nit', ?, ?, 'activo', ?, 1, ?)`,
    )
    .run(id, id, id, estado, notionPageId);
  raw.close();
}

test('actualizarEstadoNotion por defecto (sync Notion->DB) NO encola outbox: evita el bounce-back', () => {
  seedEmpresa('me1', 'contacto_iniciado', 'page-me1');
  actualizarEstadoNotion('me1', 'oportunidad', 1, '2026-07-24');

  const fila = outboxPendientes().find((p) => p.payload.notionPageId === 'page-me1');
  assert.equal(fila, undefined);
});

test('actualizarEstadoNotion con encolarNotion:true encola el nuevo estado al outbox (mover_estado DB->Notion)', () => {
  seedEmpresa('me2', 'contacto_iniciado', 'page-me2');
  actualizarEstadoNotion('me2', 'oportunidad', 1, '2026-07-24', { encolarNotion: true });

  const fila = outboxPendientes().find((p) => p.payload.notionPageId === 'page-me2');
  assert.ok(fila, 'debe haber una fila de outbox con el estado');
  assert.equal(fila!.payload.estado, 'oportunidad');
});

test('actualizarEstadoNotion con encolarNotion:true pero sin cambio real de estado no encola nada', () => {
  seedEmpresa('me3', 'oportunidad', 'page-me3');
  actualizarEstadoNotion('me3', 'oportunidad', 1, '2026-07-24', { encolarNotion: true });

  const fila = outboxPendientes().find((p) => p.payload.notionPageId === 'page-me3');
  assert.equal(fila, undefined);
});

test.after(() => borrarDbPrueba(dbPath));
