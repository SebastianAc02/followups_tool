// Pruebas de las constantes de dominio del funnel (rediseño home).
import test from 'node:test';
import assert from 'node:assert/strict';
import { FUNNEL_ETAPAS, ESTADOS_CALIENTES, ESTADOS_ACTIVOS } from './funnel.ts';

test('FUNNEL_ETAPAS: cada etapa tiene estado, label y colorClass no vacíos', () => {
  assert.ok(FUNNEL_ETAPAS.length > 0, 'debe haber al menos una etapa');
  for (const e of FUNNEL_ETAPAS) {
    assert.ok(e.estado.length > 0, 'estado no vacío');
    assert.ok(e.label.length > 0, 'label no vacío');
    assert.ok(e.colorClass.length > 0, 'colorClass no vacío');
  }
});

test('FUNNEL_ETAPAS: los estados son únicos y ninguno es "sin estado"', () => {
  const estados = FUNNEL_ETAPAS.map((e) => e.estado);
  assert.equal(new Set(estados).size, estados.length, 'estados únicos');
  assert.ok(!estados.includes(''), 'no incluye estado vacío');
});

test('ESTADOS_CALIENTES: son las 4 salidas calientes conocidas', () => {
  assert.deepEqual(
    [...ESTADOS_CALIENTES].sort(),
    ['cierre_documentacion', 'enviar_contrato', 'oportunidad', 'reunion_agendada'],
  );
});

test('ESTADOS_ACTIVOS: no incluye on_hold ni el estado vacío', () => {
  assert.ok(!ESTADOS_ACTIVOS.includes('on_hold'));
  assert.ok(!ESTADOS_ACTIVOS.includes(''));
});
