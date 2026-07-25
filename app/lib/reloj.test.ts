import test from 'node:test';
import assert from 'node:assert/strict';
import { marcarOffsetDias, hoy, offsetActual } from './reloj.ts';
import { marcarModoPrueba } from './modo-prueba.ts';
import { fechaBogotaISO, sumarDias } from './date-utils.ts';

test('sin marca de modo, hoy() es la fecha real y el offset se ignora', () => {
  marcarModoPrueba(false);
  marcarOffsetDias(5);
  const real = fechaBogotaISO();
  assert.equal(hoy(), real, 'en base real el offset no aplica');
});

test('en modo prueba, hoy() suma el offset de dias', () => {
  marcarModoPrueba(true);
  marcarOffsetDias(3);
  const esperado = sumarDias(fechaBogotaISO(), 3);
  assert.equal(hoy(), esperado, 'debe adelantar 3 dias');
});

test('offsetActual refleja lo marcado (para pintar la fecha simulada)', () => {
  marcarModoPrueba(true);
  marcarOffsetDias(7);
  assert.equal(offsetActual(), 7);
});

test('sin marcar offset, es 0', () => {
  marcarModoPrueba(true);
  marcarOffsetDias(0);
  assert.equal(offsetActual(), 0);
  assert.equal(hoy(), fechaBogotaISO());
});
