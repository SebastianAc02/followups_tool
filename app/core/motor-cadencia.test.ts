// V4.4: pruebas del reparto A/B por peso (puro, sin DB).

import test from 'node:test';
import assert from 'node:assert/strict';
import { elegirVersionPorPeso } from './motor-cadencia.ts';

function repartir(versiones: { id: number; peso: number }[], n: number) {
  const cuenta = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const id = elegirVersionPorPeso(versiones, i);
    cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
  }
  return cuenta;
}

test('pesos iguales [1,1] reparten mitad y mitad sobre 6 destinatarios', () => {
  const cuenta = repartir([{ id: 10, peso: 1 }, { id: 20, peso: 1 }], 6);
  assert.equal(cuenta.get(10), 3);
  assert.equal(cuenta.get(20), 3);
});

test('pesos [2,1] reparten 2:1 sobre 6 destinatarios', () => {
  const cuenta = repartir([{ id: 10, peso: 2 }, { id: 20, peso: 1 }], 6);
  assert.equal(cuenta.get(10), 4);
  assert.equal(cuenta.get(20), 2);
});

test('es determinista: mismo indice siempre da la misma version', () => {
  const vs = [{ id: 1, peso: 3 }, { id: 2, peso: 1 }];
  for (let i = 0; i < 20; i++) {
    assert.equal(elegirVersionPorPeso(vs, i), elegirVersionPorPeso(vs, i));
  }
});

test('una version con peso 0 no recibe trafico', () => {
  const cuenta = repartir([{ id: 10, peso: 1 }, { id: 20, peso: 0 }], 5);
  assert.equal(cuenta.get(10), 5);
  assert.equal(cuenta.get(20), undefined);
});

test('sin versiones con peso > 0 lanza', () => {
  assert.throws(() => elegirVersionPorPeso([{ id: 1, peso: 0 }], 0), /peso > 0/);
});
