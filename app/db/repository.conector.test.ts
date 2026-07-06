// Pruebas de Repository para credenciales de conector (V3.2). Verifica que la columna
// credencial_ciphertext nunca guarda el texto plano, y que leerCredencialConector
// devuelve el secreto original.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;
process.env.FOLLOWUPS_CRYPTO_KEY = Buffer.alloc(32, 3).toString('base64');

const { guardarCredencialConector, leerCredencialConector } = await import('./repository.ts');

test('la columna credencial_ciphertext nunca contiene el texto plano', () => {
  const secreto = 'granola-api-key-real-123';
  guardarCredencialConector('granola', secreto);

  const raw = new Database(dbPath);
  const fila = raw
    .prepare('SELECT credencial_ciphertext FROM conector WHERE proveedor = ?')
    .get('granola') as { credencial_ciphertext: string } | undefined;
  raw.close();

  assert.ok(fila?.credencial_ciphertext);
  assert.doesNotMatch(fila.credencial_ciphertext, new RegExp(secreto));
});

test('leerCredencialConector descifra de vuelta al secreto original', () => {
  guardarCredencialConector('notion', 'notion-token-abc');
  assert.strictEqual(leerCredencialConector('notion'), 'notion-token-abc');
});

test('leerCredencialConector devuelve null si el proveedor no tiene credencial', () => {
  assert.strictEqual(leerCredencialConector('no-existe'), null);
});

test.after(() => borrarDbPrueba(dbPath));
