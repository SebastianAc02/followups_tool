import test from 'node:test';
import assert from 'node:assert/strict';
import { pill, pillParaEstado } from './pill.variants.ts';

test('pill: variante hot rinde el token de today', () => {
  assert.match(pill({ tone: 'hot' }), /text-today/);
});

test('pill: variante cold rinde el token muted', () => {
  assert.match(pill({ tone: 'cold' }), /text-muted/);
});

test('pillParaEstado: mapea un estado conocido a su tono', () => {
  assert.deepEqual(pillParaEstado('oportunidad'), { label: 'oportunidad', tone: 'hot' });
});

test('pillParaEstado: estado desconocido o vacio da undefined', () => {
  assert.equal(pillParaEstado('no_existe'), undefined);
  assert.equal(pillParaEstado(null), undefined);
  assert.equal(pillParaEstado(undefined), undefined);
});
