import test from 'node:test';
import assert from 'node:assert/strict';
import { pill, pillDot, pillParaEstado } from './pill.variants.ts';

test('pill: shell plano, calca el pill de estado del mockup (Arc)', () => {
  assert.match(pill(), /bg-\[#1c1c20\]/);
});

test('pillDot: cada tono tiene su color de punto', () => {
  assert.equal(pillDot.hot, 'bg-today');
  assert.equal(pillDot.warm, 'bg-ink-soft');
  assert.equal(pillDot.cold, 'bg-faint');
});

test('pillParaEstado: mapea un estado conocido a su tono', () => {
  assert.deepEqual(pillParaEstado('oportunidad'), { label: 'oportunidad', tone: 'hot' });
});

test('pillParaEstado: estado desconocido o vacio da undefined', () => {
  assert.equal(pillParaEstado('no_existe'), undefined);
  assert.equal(pillParaEstado(null), undefined);
  assert.equal(pillParaEstado(undefined), undefined);
});
