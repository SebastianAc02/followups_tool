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

// Los dos huerfanos apuntan a enviar_contrato, que engloba las dos etapas de cierre de
// Notion. El destino esta fijado a proposito: mover estos dos valores cambia el conteo de
// la etapa en la base, y sin test se movia sin que nadie se enterara.
test('Contrato Firmado (huerfano) mapea a enviar_contrato', () => {
  assert.equal(mapearEstadoNotion('Contrato Firmado'), 'enviar_contrato');
});

test('Firma Pendiente (huerfano) mapea a enviar_contrato', () => {
  assert.equal(mapearEstadoNotion('Firma Pendiente'), 'enviar_contrato');
});

// Ninguno de los dos cae en firma_pago: "firmado" no es "pago hecho".
test('ningun huerfano cae en firma_pago', () => {
  for (const estado of ['Contrato Firmado', 'Firma Pendiente']) {
    assert.notEqual(mapearEstadoNotion(estado), 'firma_pago');
  }
});

// enviar_contrato es uno de los 8 valores que el CHECK de empresa.estado_notion ya acepta.
// Ese es el punto del mapeo: sin valor nuevo, no hay que recrear la tabla empresa.
test('el destino de los huerfanos es un estado que el CHECK ya acepta', () => {
  const ACEPTADOS = [
    'lead',
    'contacto_iniciado',
    'oportunidad',
    'reunion_agendada',
    'cierre_documentacion',
    'enviar_contrato',
    'on_hold',
    'firma_pago',
  ];
  for (const estado of ['Contrato Firmado', 'Firma Pendiente']) {
    assert.ok(ACEPTADOS.includes(mapearEstadoNotion(estado)));
  }
});

test('estado desconocido lanza error, no rompe el CHECK en silencio', () => {
  assert.throws(() => mapearEstadoNotion('Estado Inventado'), /Estado Inventado/);
});
