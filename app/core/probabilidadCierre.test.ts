import test from 'node:test';
import assert from 'node:assert/strict';
import { probabilidadCierrePorEtapa } from './probabilidadCierre.ts';

test('firma_pago (ya cliente) es la probabilidad maxima', () => {
  assert.equal(probabilidadCierrePorEtapa('firma_pago').valor, 1);
});

test('on_hold (durmiente) es la probabilidad minima mapeada', () => {
  assert.equal(probabilidadCierrePorEtapa('on_hold').valor, 0.05);
});

test('etapas mas cerca del cierre pesan mas que etapas tempranas', () => {
  const cierre = probabilidadCierrePorEtapa('cierre_documentacion').valor;
  const reunion = probabilidadCierrePorEtapa('reunion_agendada').valor;
  const contacto = probabilidadCierrePorEtapa('contacto_iniciado').valor;
  assert.ok(cierre > reunion);
  assert.ok(reunion > contacto);
});

test('etapa desconocida y null caen al default, no revientan', () => {
  assert.equal(probabilidadCierrePorEtapa('etapa_que_no_existe').valor, 0.15);
  assert.equal(probabilidadCierrePorEtapa(null).valor, 0.15);
});

test('el metodo siempre se declara heuristico', () => {
  assert.equal(probabilidadCierrePorEtapa('reunion_agendada').metodo, 'heuristica_por_etapa');
});
