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

const { guardarCredencialConector, leerCredencialConector, borrarCredencialConector, estadoConector } =
  await import('./repository.ts');

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

test('dos usuarios tienen cada uno su propia credencial de granola sin pisarse', () => {
  guardarCredencialConector('granola', 'key-sebastian', 'user-sebastian');
  guardarCredencialConector('granola', 'key-felipe', 'user-felipe');

  assert.strictEqual(leerCredencialConector('granola', 'user-sebastian'), 'key-sebastian');
  assert.strictEqual(leerCredencialConector('granola', 'user-felipe'), 'key-felipe');
});

test('guardar credencial global (sin idUsuario) dos veces actualiza la misma fila, no duplica', () => {
  guardarCredencialConector('notion', 'token-viejo');
  guardarCredencialConector('notion', 'token-nuevo');

  assert.strictEqual(leerCredencialConector('notion'), 'token-nuevo');

  const raw = new Database(dbPath);
  const n = (raw.prepare("SELECT count(*) as n FROM conector WHERE proveedor = 'notion'").get() as { n: number }).n;
  raw.close();
  assert.strictEqual(n, 1);
});

// A (2026-07-15): "Quitar y borrar credencial" en /conectores (decision: Quitar se parte
// en Desactivar vs Quitar-y-borrar). quitarConfigConector solo duerme la POLITICA
// (habilitado=0) y deja el secreto cifrado intacto -- por eso re-agregar un conector lo
// revivia YA conectado y nunca se podia rehacer el OAuth desde cero.
test('borrarCredencialConector deja el conector sin credencial pero no borra la fila (conserva el historial)', () => {
  guardarCredencialConector('gmail', 'secreto-de-prueba', 'u1');
  assert.strictEqual(estadoConector('gmail', 'u1').tieneCredencial, true);

  borrarCredencialConector('gmail', 'u1');

  const estado = estadoConector('gmail', 'u1');
  assert.strictEqual(estado.tieneCredencial, false, 'la credencial se fue');
  assert.strictEqual(estado.estado, 'sin_credencial', 'y el estado lo dice');
  assert.strictEqual(leerCredencialConector('gmail', 'u1'), null);
});

test.after(() => borrarDbPrueba(dbPath));
