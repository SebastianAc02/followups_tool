import { test } from 'node:test';
import assert from 'node:assert/strict';
import { huellaRequest, ipDelRequest } from './huella-request.ts';

const h = (pares: Record<string, string>) => new Headers(pares);

test('toma el ultimo salto de x-forwarded-for, no el primero', () => {
  // El primero lo puede inventar cualquiera que le pegue al endpoint publico; el ultimo
  // lo escribio Caddy con el peer real.
  assert.equal(ipDelRequest(h({ 'x-forwarded-for': '1.2.3.4, 66.249.84.10' })), '66.249.84.10');
});

test('con un solo salto devuelve esa ip', () => {
  assert.equal(ipDelRequest(h({ 'x-forwarded-for': '66.249.84.10' })), '66.249.84.10');
});

test('tolera espacios y elementos vacios en la cadena', () => {
  assert.equal(ipDelRequest(h({ 'x-forwarded-for': ' 1.2.3.4 ,  , 66.249.84.10 ' })), '66.249.84.10');
});

test('cae a x-real-ip y a cf-connecting-ip si no hay x-forwarded-for', () => {
  assert.equal(ipDelRequest(h({ 'x-real-ip': '9.9.9.9' })), '9.9.9.9');
  assert.equal(ipDelRequest(h({ 'cf-connecting-ip': '8.8.8.8' })), '8.8.8.8');
});

test('sin ningun encabezado la ip queda null, no una cadena vacia', () => {
  assert.equal(ipDelRequest(h({})), null);
});

test('la huella lleva ua e ip, y omite xff cuando hay un solo salto', () => {
  const huella = huellaRequest(
    h({ 'user-agent': 'Mozilla/5.0 (Macintosh)', 'x-forwarded-for': '66.249.84.10' }),
  );
  assert.deepEqual(huella, { ua: 'Mozilla/5.0 (Macintosh)', ip: '66.249.84.10' });
});

test('la huella conserva el xff crudo cuando la cadena trae mas de un salto', () => {
  const huella = huellaRequest(h({ 'user-agent': 'GoogleImageProxy', 'x-forwarded-for': '1.2.3.4, 66.249.84.10' }));
  assert.deepEqual(huella, { ua: 'GoogleImageProxy', ip: '66.249.84.10', xff: '1.2.3.4, 66.249.84.10' });
});

test('un request pelado deja los dos campos en null en vez de romper', () => {
  assert.deepEqual(huellaRequest(h({})), { ua: null, ip: null });
});
