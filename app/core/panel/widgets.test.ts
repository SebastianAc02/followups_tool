import test from 'node:test';
import assert from 'node:assert/strict';
import { WIDGETS, widgetPorId } from './widgets.ts';

test('cada widget tiene id unico', () => {
  const ids = WIDGETS.map((w) => w.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('widgetPorId devuelve el widget o undefined', () => {
  assert.equal(widgetPorId('deals_nuevos')?.tipo, 'kpi');
  assert.equal(widgetPorId('no_existe'), undefined);
});
