// Pruebas de Repository para configuracion_admin: valores de negocio no secretos
// editables desde /conectores (2026-07-14), separados de conector.credencialCiphertext.
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;
process.env.FOLLOWUPS_CRYPTO_KEY = Buffer.alloc(32, 4).toString('base64');

const { leerConfiguracionAdmin, guardarConfiguracionAdmin } = await import('./repository.ts');

test('leerConfiguracionAdmin devuelve null si la clave no existe', () => {
  assert.strictEqual(leerConfiguracionAdmin('no-existe'), null);
});

test('guardarConfiguracionAdmin crea la fila y leerConfiguracionAdmin la devuelve', () => {
  guardarConfiguracionAdmin('apollo_mailbox_id', 'buzon-real-1', 'user-sebastian');
  assert.strictEqual(leerConfiguracionAdmin('apollo_mailbox_id'), 'buzon-real-1');
});

test('guardar dos veces la misma clave actualiza la fila, no duplica', () => {
  guardarConfiguracionAdmin('apollo_mailbox_id', 'buzon-viejo');
  guardarConfiguracionAdmin('apollo_mailbox_id', 'buzon-nuevo', 'user-sebastian');

  assert.strictEqual(leerConfiguracionAdmin('apollo_mailbox_id'), 'buzon-nuevo');
});

test.after(() => borrarDbPrueba(dbPath));
