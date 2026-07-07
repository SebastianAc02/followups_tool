// Prueba estructural de la tabla conector_config del rediseño de conectores. No prueba
// logica de negocio (eso llega en repository.conectorConfig.test.ts), solo que la migracion
// promete la tabla con sus columnas. Corre contra la DB de prueba, nunca isps.db real.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();

test('la tabla conector_config existe con sus columnas', () => {
  const raw = new Database(dbPath);
  const cols = raw
    .prepare("PRAGMA table_info(conector_config)")
    .all()
    .map((c: any) => c.name)
    .sort();
  raw.close();
  assert.deepEqual(cols, ['agregado_por', 'created_at', 'habilitado', 'modo', 'proveedor', 'updated_at']);
});

test.after(() => borrarDbPrueba(dbPath));
