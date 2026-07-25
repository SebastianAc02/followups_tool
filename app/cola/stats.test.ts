import test from 'node:test';
import assert from 'node:assert/strict';
import { contarCerradas } from './stats.ts';
import { CANALES_TOQUE, RESULTADOS, type CanalToque, type Resultado } from '../db/validation.ts';

// Arma un ContadoresHoy completo a partir de los pocos buckets que le importan al test. Se
// construye desde los enums y no a mano: la taxonomia de resultados paso de 5 a 20 valores el
// 2026-07-25 y un literal escrito a mano obliga a tocar este archivo cada vez que crezca.
function contadores(resultados: Partial<Record<Resultado, number>>, total: number) {
  const porCanal = Object.fromEntries(CANALES_TOQUE.map((c) => [c, 0])) as Record<CanalToque, number>;
  const porResultado = Object.fromEntries(RESULTADOS.map((r) => [r, resultados[r] ?? 0])) as Record<Resultado, number>;
  return { porCanal, porResultado, total };
}

test('contarCerradas: es el total de contadoresHoy', () => {
  assert.equal(
    contarCerradas(contadores({ contesto_reunion: 1, contesto_no: 2 }, 3)),
    3,
  );
});

test('contarCerradas: sin toques hoy da cero', () => {
  assert.equal(
    contarCerradas(contadores({}, 0)),
    0,
  );
});
