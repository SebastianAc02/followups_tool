// Tabla Estado Notion -> estado_notion (DB), ver planning/spec-carga-reconciliacion-notion.md
// (Fase 3: "Estados"). Uno-a-uno por nombre; los dos huerfanos (Contrato Firmado,
// Firma Pendiente) son excepcion explicita, no un fuzzy-match general. Un valor
// desconocido lanza error para no romper el CHECK de la DB en silencio (eso pasaria
// en T10, el writer; aqui se falla temprano y claro).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapearEstadoNotion } from './mapeoEstados.ts';

test('On Hold mapea a on_hold', () => {
  assert.equal(mapearEstadoNotion('On Hold'), 'on_hold');
});

test('Firma y Pago Realizado mapea a firma_pago', () => {
  assert.equal(mapearEstadoNotion('Firma y Pago Realizado'), 'firma_pago');
});

test('Contrato Firmado (huerfano) mapea a cierre_documentacion', () => {
  assert.equal(mapearEstadoNotion('Contrato Firmado'), 'cierre_documentacion');
});

test('Firma Pendiente (huerfano) mapea a cierre_documentacion', () => {
  assert.equal(mapearEstadoNotion('Firma Pendiente'), 'cierre_documentacion');
});

test('estado desconocido lanza error, no rompe el CHECK en silencio', () => {
  assert.throws(() => mapearEstadoNotion('Estado Inventado'), /Estado Inventado/);
});
