import test from 'node:test';
import assert from 'node:assert/strict';
import { chip } from './chip.variants.ts';

test('chip: activo (on) rinde fondo blanco', () => {
  assert.match(chip({ on: true }), /bg-white/);
});

test('chip: inactivo (default) rinde el fondo de superficie', () => {
  assert.match(chip({}), /bg-surface\b/);
});
