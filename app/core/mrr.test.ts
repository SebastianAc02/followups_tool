import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularMrrEstimado, digitalPctConDefault } from './mrr.ts';

test('calcularMrrEstimado: usuarios x digital x tarifa + saas', () => {
  const mrr = calcularMrrEstimado({ usuarios: 100, digitalPct: 0.5, tarifaTxnPlan: 200, saasMensual: 50000 });
  // 100 * 0.5 * 200 = 10000; + 50000 = 60000
  assert.equal(mrr, 60000);
});

test('calcularMrrEstimado: digital 100% es el caso simple (sin descuento)', () => {
  const mrr = calcularMrrEstimado({ usuarios: 40, digitalPct: 1, tarifaTxnPlan: 300, saasMensual: 0 });
  assert.equal(mrr, 12000);
});

test('calcularMrrEstimado: 0 usuarios deja solo el saas fijo', () => {
  const mrr = calcularMrrEstimado({ usuarios: 0, digitalPct: 1, tarifaTxnPlan: 300, saasMensual: 90000 });
  assert.equal(mrr, 90000);
});

test('digitalPctConDefault: null y undefined caen al 40% (igual que la formula de Notion)', () => {
  assert.equal(digitalPctConDefault(null), 0.4);
  assert.equal(digitalPctConDefault(undefined), 0.4);
});

test('digitalPctConDefault: un valor real explicito nunca se pisa', () => {
  assert.equal(digitalPctConDefault(0.35), 0.35);
  assert.equal(digitalPctConDefault(0), 0);
});

test('calcularMrrEstimado: ancla contra un deal real de Notion (plan Pro, 4.000 usuarios, 40% digital)', () => {
  // Verificado 2026-07-22 contra el "MRR potencial" real de Notion para este deal: COP 4.488.000.
  const mrr = calcularMrrEstimado({
    usuarios: 4000,
    digitalPct: digitalPctConDefault(null),
    tarifaTxnPlan: 1680,
    saasMensual: 1_800_000,
  });
  assert.equal(mrr, 4_488_000);
});
