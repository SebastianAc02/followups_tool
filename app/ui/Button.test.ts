import test from 'node:test';
import assert from 'node:assert/strict';
import { button } from './button.variants.ts';

test('button: variante pill rinde rounded-full', () => {
  assert.match(button({ variant: 'pill' }), /rounded-full/);
});

test('button: variante block rinde ancho completo', () => {
  assert.match(button({ variant: 'block' }), /w-full/);
});
