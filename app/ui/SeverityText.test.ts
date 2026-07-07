import test from 'node:test';
import assert from 'node:assert/strict';
import { severityText } from './severity-text.variants.ts';

test('severityText: overdue usa el token overdue', () => {
  assert.match(severityText({ variant: 'overdue' }), /text-overdue/);
});

test('severityText: today usa el token today', () => {
  assert.match(severityText({ variant: 'today' }), /text-today/);
});
