import test from 'node:test';
import assert from 'node:assert/strict';
import { cn } from './cn.ts';

test('cn: descarta falsy igual que cx', () => {
  assert.equal(cn('a', false, 'b', null, undefined, 'c'), 'a b c');
});

test('cn: resuelve conflictos de utilities (la ultima gana)', () => {
  assert.equal(cn('px-2', 'px-4'), 'px-4');
});
