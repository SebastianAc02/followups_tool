import test from 'node:test';
import assert from 'node:assert/strict';
import { cx } from './cx.ts';

test('cx: sin argumentos da string vacio', () => {
  assert.equal(cx(), '');
});

test('cx: descarta falsy y une los truthy con un espacio', () => {
  assert.equal(cx('a', false, 'b', null, undefined, 'c'), 'a b c');
});
