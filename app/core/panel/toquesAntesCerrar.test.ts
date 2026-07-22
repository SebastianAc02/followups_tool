import test from 'node:test';
import assert from 'node:assert/strict';
import { contarToquesAntesDeFecha } from './toquesAntesCerrar.ts';

test('contarToquesAntesDeFecha cuenta solo las fechas anteriores al cierre', () => {
  const fechas = ['2026-01-01', '2026-01-05', '2026-01-11', '2026-02-01'];
  assert.equal(contarToquesAntesDeFecha(fechas, '2026-01-10'), 2);
});

test('contarToquesAntesDeFecha: sin toques devuelve 0', () => {
  assert.equal(contarToquesAntesDeFecha([], '2026-01-10'), 0);
});

test('contarToquesAntesDeFecha: un toque el mismo dia del cierre NO cuenta (estricto <)', () => {
  assert.equal(contarToquesAntesDeFecha(['2026-01-10'], '2026-01-10'), 0);
});
