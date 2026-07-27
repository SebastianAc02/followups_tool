import test from 'node:test';
import assert from 'node:assert/strict';
import { contarToquesHoy } from './stats.ts';
import { CANALES_TOQUE, RESULTADOS, type CanalToque, type Resultado } from '../db/validation.ts';

// Arma un ContadoresHoy completo a partir de los pocos buckets que le importan al test. Se
// construye desde los enums y no a mano: la taxonomia de resultados paso de 5 a 20 valores el
// 2026-07-25 y un literal escrito a mano obliga a tocar este archivo cada vez que crezca.
//
// `entrantes` es parte de la firma desde el 2026-07-27 (contadoresHoy separa lo ejecutado de
// las respuestas del ISP): se pasa aparte y NO se suma a total, para que estos tests dejen
// explicito que contarToquesHoy no vuelve a mezclarlos.
function contadores(resultados: Partial<Record<Resultado, number>>, total: number, entrantes = 0) {
  const porCanal = Object.fromEntries(CANALES_TOQUE.map((c) => [c, 0])) as Record<CanalToque, number>;
  const porResultado = Object.fromEntries(RESULTADOS.map((r) => [r, resultados[r] ?? 0])) as Record<Resultado, number>;
  return { porCanal, porResultado, total, entrantes };
}

test('contarToquesHoy: es el total (ya ejecutado, sin entrantes) de contadoresHoy', () => {
  assert.equal(
    contarToquesHoy(contadores({ contesto_reunion: 1, contesto_no: 2 }, 3)),
    3,
  );
});

test('contarToquesHoy: sin toques hoy da cero', () => {
  assert.equal(
    contarToquesHoy(contadores({}, 0)),
    0,
  );
});

// Caso real 2026-07-27: 42 mensajes entrantes de un solo hilo, cero toques del operador.
// contarToquesHoy lee `total` tal cual lo entrega contadoresHoy (ya excluido alla), no debe
// volver a sumarle `entrantes`.
test('contarToquesHoy: no suma los entrantes aunque vengan altos', () => {
  assert.equal(
    contarToquesHoy(contadores({}, 0, 42)),
    0,
    'total ya viene sin los 42 entrantes; contarToquesHoy no debe recontarlos',
  );
});
