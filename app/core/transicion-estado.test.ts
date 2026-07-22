import test from 'node:test';
import assert from 'node:assert/strict';
import { estadoDestinoPorToque } from './transicion-estado.ts';

test('on_hold + cualquier resultado que no sea reunion -> contacto_iniciado', () => {
  assert.equal(estadoDestinoPorToque('on_hold', 'no_contesto'), 'contacto_iniciado');
  assert.equal(estadoDestinoPorToque('on_hold', 'contesto_sigue_seguimiento'), 'contacto_iniciado');
  assert.equal(estadoDestinoPorToque('on_hold', 'contesto_no'), 'contacto_iniciado');
});

test('on_hold + contesto_reunion salta directo a reunion_agendada (no pasa por contacto_iniciado)', () => {
  assert.equal(estadoDestinoPorToque('on_hold', 'contesto_reunion'), 'reunion_agendada');
});

test('contacto_iniciado + contesto_reunion -> reunion_agendada', () => {
  assert.equal(estadoDestinoPorToque('contacto_iniciado', 'contesto_reunion'), 'reunion_agendada');
});

test('contacto_iniciado + un resultado que no es reunion no dispara nada (ya esta avanzado)', () => {
  assert.equal(estadoDestinoPorToque('contacto_iniciado', 'no_contesto'), null);
  assert.equal(estadoDestinoPorToque('contacto_iniciado', 'contesto_sigue_seguimiento'), null);
});

test('nunca retrocede: una empresa mas adelante en el funnel no vuelve a un estado anterior', () => {
  assert.equal(estadoDestinoPorToque('oportunidad', 'contesto_reunion'), null);
  assert.equal(estadoDestinoPorToque('cierre_documentacion', 'no_contesto'), null);
  assert.equal(estadoDestinoPorToque('reunion_agendada', 'contesto_no'), null);
  assert.equal(estadoDestinoPorToque('firma_pago', 'contesto_reunion'), null);
});

test('lead es dormido igual que on_hold (regla 2026-07-15): un toque no lo gradua solo', () => {
  assert.equal(estadoDestinoPorToque('lead', 'no_contesto'), null);
  assert.equal(estadoDestinoPorToque('lead', 'contesto_reunion'), null);
});

test('estado null (empresa sin etapa) no dispara ninguna transicion', () => {
  assert.equal(estadoDestinoPorToque(null, 'no_contesto'), null);
  assert.equal(estadoDestinoPorToque(null, 'contesto_reunion'), null);
});
