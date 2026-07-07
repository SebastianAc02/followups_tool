import test from 'node:test';
import assert from 'node:assert/strict';
import { formatoFechaLargaEsCo, saludoPorHora } from './date-utils.ts';

test('formatoFechaLargaEsCo: dia, numero y mes en espanol, sin ano', () => {
  assert.equal(formatoFechaLargaEsCo('2026-07-07'), 'Martes 7 de julio');
});

test('formatoFechaLargaEsCo: enero cruza de ano sin correrse de dia', () => {
  assert.equal(formatoFechaLargaEsCo('2026-01-01'), 'Jueves 1 de enero');
});

test('saludoPorHora: manana', () => {
  assert.equal(saludoPorHora(5), 'Buenos días');
  assert.equal(saludoPorHora(9), 'Buenos días');
  assert.equal(saludoPorHora(11), 'Buenos días');
});

test('saludoPorHora: tarde', () => {
  assert.equal(saludoPorHora(12), 'Buenas tardes');
  assert.equal(saludoPorHora(18), 'Buenas tardes');
});

test('saludoPorHora: noche y madrugada', () => {
  assert.equal(saludoPorHora(19), 'Buenas noches');
  assert.equal(saludoPorHora(23), 'Buenas noches');
  assert.equal(saludoPorHora(0), 'Buenas noches');
  assert.equal(saludoPorHora(4), 'Buenas noches');
});
