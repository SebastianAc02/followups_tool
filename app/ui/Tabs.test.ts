import test from 'node:test';
import assert from 'node:assert/strict';
import { tabButton } from './tabs.variants.ts';

test('tabButton: activo (active) marca el fondo de superficie y texto fuerte', () => {
  assert.match(tabButton({ active: true }), /bg-surface-2/);
  assert.match(tabButton({ active: true }), /text-ink\b/);
});

test('tabButton: inactivo (default) usa texto muted', () => {
  assert.match(tabButton({}), /text-muted/);
});
