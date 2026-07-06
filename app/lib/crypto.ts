import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';

function getKey(): Buffer {
  const raw = process.env.FOLLOWUPS_CRYPTO_KEY;
  if (!raw) {
    throw new Error('FOLLOWUPS_CRYPTO_KEY no esta configurada (revisa .env.local)');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('FOLLOWUPS_CRYPTO_KEY debe decodificar a 32 bytes en base64');
  }
  return key;
}

export function cifrar(textoPlano: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const datos = Buffer.concat([cipher.update(textoPlano, 'utf8'), cipher.final()]);
  return [iv, datos, cipher.getAuthTag()].map((b) => b.toString('base64')).join('.');
}

export function descifrar(ciphertext: string): string {
  const [iv, datos, tag] = ciphertext.split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(datos), decipher.final()]).toString('utf8');
}
