import { test } from 'node:test';
import assert from 'node:assert';
import { cifrar, descifrar } from './crypto.ts';

test('cifra y descifra ida y vuelta', () => {
  process.env.FOLLOWUPS_CRYPTO_KEY = Buffer.alloc(32, 7).toString('base64');
  const secreto = 'granola-api-key-123';
  const ct = cifrar(secreto);
  assert.notStrictEqual(ct, secreto);
  assert.strictEqual(descifrar(ct), secreto);
});

test('con otra llave el ciphertext no se lee', () => {
  process.env.FOLLOWUPS_CRYPTO_KEY = Buffer.alloc(32, 7).toString('base64');
  const ct = cifrar('secreto');
  process.env.FOLLOWUPS_CRYPTO_KEY = Buffer.alloc(32, 9).toString('base64');
  assert.throws(() => descifrar(ct));
});
