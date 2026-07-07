import test from 'node:test';
import assert from 'node:assert/strict';
import { statValue } from './stat.variants.ts';

test('statValue: tono done usa el acento', () => {
  assert.match(statValue({ tone: 'done' }), /text-acento/);
});

test('statValue: tono overdue usa el token overdue', () => {
  assert.match(statValue({ tone: 'overdue' }), /text-overdue/);
});

test('statValue: default es neutral', () => {
  assert.match(statValue({}), /text-ink\b/);
});
