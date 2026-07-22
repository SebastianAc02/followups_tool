import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularVelocidadCambioEtapa } from './velocity.ts';

test('divide transiciones entre dias del rango', () => {
  assert.equal(calcularVelocidadCambioEtapa(14, 7), 2);
});

test('rango sin dias (desde == hasta invertido) no revienta, da 0', () => {
  assert.equal(calcularVelocidadCambioEtapa(5, 0), 0);
  assert.equal(calcularVelocidadCambioEtapa(5, -3), 0);
});

test('sin transiciones la velocidad es 0', () => {
  assert.equal(calcularVelocidadCambioEtapa(0, 10), 0);
});

test('acepta fracciones (velocity parcial)', () => {
  assert.equal(calcularVelocidadCambioEtapa(1, 4), 0.25);
});
