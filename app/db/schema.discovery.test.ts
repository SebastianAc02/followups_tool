// Guarda de esquema para las columnas de discovery (2026-07-15). No prueban logica: prueban
// que el DDL del harness (test-helpers.ts) sigue teniendo las columnas que schema.ts declara.
// Esa duplicacion es a mano y se desincroniza en silencio (ver el comentario de cabecera de
// test-helpers.ts): sin este test, agregar una columna al schema y olvidarla en el harness
// revienta con "no such column" en cualquier test de repository, lejos de la causa.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

test('empresa tiene notas_discovery y brief', () => {
  const dbPath = crearDbPrueba();
  try {
    const sqlite = new Database(dbPath);
    const cols = sqlite.prepare("SELECT name FROM pragma_table_info('empresa')").all() as { name: string }[];
    const nombres = cols.map((c) => c.name);
    sqlite.close();
    assert.ok(nombres.includes('notas_discovery'), 'falta empresa.notas_discovery');
    assert.ok(nombres.includes('brief'), 'falta empresa.brief');
  } finally {
    borrarDbPrueba(dbPath);
  }
});

test('toque tiene resumen y transcript_resumen', () => {
  const dbPath = crearDbPrueba();
  try {
    const sqlite = new Database(dbPath);
    const cols = sqlite.prepare("SELECT name FROM pragma_table_info('toque')").all() as { name: string }[];
    const nombres = cols.map((c) => c.name);
    sqlite.close();
    assert.ok(nombres.includes('resumen'), 'falta toque.resumen');
    assert.ok(nombres.includes('transcript_resumen'), 'falta toque.transcript_resumen');
  } finally {
    borrarDbPrueba(dbPath);
  }
});
