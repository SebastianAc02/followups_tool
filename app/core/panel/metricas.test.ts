import test from 'node:test';
import assert from 'node:assert/strict';
import { resolverMetrica } from './metricas.ts';

test('dataSource conocido devuelve valor real', () => {
  const r = resolverMetrica('toquesTotal', { toquesTotal: 42 });
  assert.deepEqual(r, { estado: 'ok', valor: 42 });
});

test('dataSource null (sin fuente en el catalogo) devuelve sin_datos', () => {
  const r = resolverMetrica(null, {});
  assert.equal(r.estado, 'sin_datos');
});

test('dataSource conocido pero sin dato calculado por el caller devuelve sin_datos', () => {
  const r = resolverMetrica('campanasActivas', {});
  assert.equal(r.estado, 'sin_datos');
});
