import test from 'node:test';
import assert from 'node:assert/strict';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';
import { dbDePrueba } from '../db/organizacion-repository.ts';
import { PreferenciasDbAdapter } from './preferencias-db.ts';
import { PREFERENCIAS_DEFAULT } from '../core/perfil.ts';

let dbPath: string;

test.beforeEach(() => {
  dbPath = crearDbPrueba();
});

test.afterEach(() => {
  borrarDbPrueba(dbPath);
});

test('leer() cae a PREFERENCIAS_DEFAULT cuando no hay fila (LSP, nunca null)', async () => {
  const adapter = new PreferenciasDbAdapter(dbDePrueba(dbPath));
  const prefs = await adapter.leer('user-sin-fila');
  assert.deepEqual(prefs, PREFERENCIAS_DEFAULT);
});

test('guardar() y despues leer() devuelve lo guardado, con default solo en lo no tocado', async () => {
  const adapter = new PreferenciasDbAdapter(dbDePrueba(dbPath));
  await adapter.guardar('user-1', { colorAvatar: 'violeta' });

  const prefs = await adapter.leer('user-1');
  assert.equal(prefs.colorAvatar, 'violeta');
  assert.equal(prefs.vistaInicio, PREFERENCIAS_DEFAULT.vistaInicio);
});
