import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularFollowUpPorDeal } from './followUpPorDeal.ts';

test('calcularFollowUpPorDeal divide toques entre deals y redondea a 1 decimal', () => {
  assert.equal(calcularFollowUpPorDeal(7, 2), 3.5);
  assert.equal(calcularFollowUpPorDeal(10, 3), 3.3);
});

test('calcularFollowUpPorDeal: 0 deals con toque devuelve 0, no divide por cero', () => {
  assert.equal(calcularFollowUpPorDeal(0, 0), 0);
});

test('calcularFollowUpPorDeal: un deal con un solo toque da 1', () => {
  assert.equal(calcularFollowUpPorDeal(1, 1), 1);
});
