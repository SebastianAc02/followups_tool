import test from 'node:test';
import assert from 'node:assert/strict';
import { canalDot, canalTagText } from './canal-tag.variants.ts';

test('canalDot: cada canal rinde su token de color', () => {
  assert.match(canalDot({ canal: 'llamada' }), /bg-canal-llamada/);
  assert.match(canalDot({ canal: 'correo' }), /bg-canal-correo/);
  assert.match(canalDot({ canal: 'whatsapp' }), /bg-canal-whatsapp/);
});

test('canalTagText: cada canal rinde su token de texto', () => {
  assert.match(canalTagText({ canal: 'whatsapp' }), /text-canal-whatsapp/);
});
