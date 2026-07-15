// Tabla Industria Notion -> veto, ver planning/spec-carga-reconciliacion-notion.md
// (Fase 2: "Categoria el no gana"). Union de vetos: nada vuelve a ISP porque un
// lado diga que si, pero esta funcion solo calcula el veto que aporta Notion;
// el de la DB (empresa_clasificacion) ya existe y se une en otra parte (T7).
import test from 'node:test';
import assert from 'node:assert/strict';
import { vetoCategoria } from './vetoCategoria.ts';

test('ISP no veta', () => {
  assert.equal(vetoCategoria('ISP'), null);
});

test('vacio no veta', () => {
  assert.equal(vetoCategoria(''), null);
});

test('Agua, Energia y Gas vetan como utility', () => {
  assert.equal(vetoCategoria('Agua'), 'es_utility_no_isp');
  assert.equal(vetoCategoria('Energía'), 'es_utility_no_isp');
  assert.equal(vetoCategoria('Gas'), 'es_utility_no_isp');
});

test('Utility veta como utility', () => {
  assert.equal(vetoCategoria('Utility'), 'es_utility_no_isp');
});

test('Telecom veta como no-isp confirmado', () => {
  assert.equal(vetoCategoria('Telecom'), 'es_no_isp_confirmado');
});

test('Otro, Educacion y Pasarela vetan como no-isp confirmado', () => {
  assert.equal(vetoCategoria('Otro'), 'es_no_isp_confirmado');
  assert.equal(vetoCategoria('Educación'), 'es_no_isp_confirmado');
  assert.equal(vetoCategoria('Pasarela'), 'es_no_isp_confirmado');
});
