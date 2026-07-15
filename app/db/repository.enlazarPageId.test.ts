// T5: enlazarPageId (Fase 1 reconciliacion Notion). Escribe notion_page_id en una
// empresa por su id de DB. Idempotente: correr dos veces con el mismo par no cambia
// nada mas alla de dejar el mismo valor.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { enlazarPageId } = await import('./repository.ts');

function seedEmpresa(id: string, nombreOficial: string, notionPageId: string | null = null) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, notion_page_id, organizacion_activa_id)
       VALUES (?, 'nit', ?, ?, 'lead', ?, 1)`,
    )
    .run(id, nombreOficial, nombreOficial.toLowerCase(), notionPageId);
  raw.close();
}

function leerPageId(id: string): string | null {
  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT notion_page_id FROM empresa WHERE id_empresa = ?').get(id) as
    | { notion_page_id: string | null }
    | undefined;
  raw.close();
  return fila?.notion_page_id ?? null;
}

test('enlaza el page_id de Notion a la empresa', () => {
  seedEmpresa('901715847', 'Celsia Internet S.A.S.');

  enlazarPageId('901715847', '35a95153c5cd805086b8c69965e0f34a');

  assert.equal(leerPageId('901715847'), '35a95153c5cd805086b8c69965e0f34a');
});

test('correr dos veces con el mismo par no cambia nada (idempotente)', () => {
  seedEmpresa('901403469', 'WINS SOLUCIONES SAS');

  enlazarPageId('901403469', '8ea10df5716e00000000000000000000');
  enlazarPageId('901403469', '8ea10df5716e00000000000000000000');

  assert.equal(leerPageId('901403469'), '8ea10df5716e00000000000000000000');
});

test('no revienta si la empresa no existe (no-op)', () => {
  assert.doesNotThrow(() => enlazarPageId('no-existe', 'abc123'));
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
