// T11: clasificarCargo mapea el texto libre de "Cargo" (Contacto Principal /
// Buying Comittee de Notion) a cargo_categoria. Casos reales del export
// (Fase 4, sección Buying Comittee) mas el fallback desconocido.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clasificarCargo } from './clasificarCargo.ts';

test('Director Comercial -> comercial', () => {
  assert.equal(clasificarCargo('Director Comercial'), 'comercial');
});

test('Gerente General -> gerente', () => {
  assert.equal(clasificarCargo('Gerente General'), 'gerente');
});

test('Recaudo -> financiero', () => {
  assert.equal(clasificarCargo('Recaudo'), 'financiero');
});

test('Cartera y Cobro y Cartera -> financiero', () => {
  assert.equal(clasificarCargo('Cartera'), 'financiero');
  assert.equal(clasificarCargo('Cobro y Cartera'), 'financiero');
});

test('CEO / Dueño -> dueno', () => {
  assert.equal(clasificarCargo('CEO / Dueño'), 'dueno');
});

test('Propietario -> dueno', () => {
  assert.equal(clasificarCargo('Propietario'), 'dueno');
});

test('Representante Legal -> rep_legal', () => {
  assert.equal(clasificarCargo('Representante Legal'), 'rep_legal');
});

test('Soporte tecnico / Jefe de Red -> tecnico', () => {
  assert.equal(clasificarCargo('Soporte Técnico'), 'tecnico');
  assert.equal(clasificarCargo('Jefe de Red'), 'tecnico');
  assert.equal(clasificarCargo('Encargado NAP'), 'tecnico');
});

test('vacio o no reconocido -> desconocido', () => {
  assert.equal(clasificarCargo(''), 'desconocido');
  assert.equal(clasificarCargo('Auxiliar de Bodega'), 'desconocido');
});

test('Subgerente Comercial -> subgerente (mas especifico que comercial o gerente)', () => {
  assert.equal(clasificarCargo('Subgerente Comercial'), 'subgerente');
});
