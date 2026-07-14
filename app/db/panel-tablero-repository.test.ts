import test from 'node:test';
import assert from 'node:assert/strict';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';
import { dbDePrueba } from './organizacion-repository.ts';
import { leerTablero, guardarTablero } from './panel-tablero-repository.ts';

let dbPath: string;
test.beforeEach(() => { dbPath = crearDbPrueba(); });
test.afterEach(() => { borrarDbPrueba(dbPath); });

test('leerTablero devuelve undefined si no hay fila', () => {
  assert.equal(leerTablero('u1', dbDePrueba(dbPath)), undefined);
});

test('guardarTablero hace upsert y leerTablero lo devuelve', () => {
  const db = dbDePrueba(dbPath);
  guardarTablero('u1', '[{"widgetId":"toques_total","span":1}]', db);
  assert.match(leerTablero('u1', db)!.layout!, /toques_total/);
});

test('guardarTablero dos veces pisa el layout anterior (upsert, no acumula filas)', () => {
  const db = dbDePrueba(dbPath);
  guardarTablero('u1', '[]', db);
  guardarTablero('u1', '[{"widgetId":"toques_total","span":2}]', db);
  const fila = leerTablero('u1', db);
  assert.match(fila!.layout!, /"span":2/);
});
