import test from 'node:test';
import assert from 'node:assert/strict';
import { marcarRelajadas } from './relleno-segmento.ts';

test('marca como relajadas las que estan en el relajado pero no en el estricto', () => {
  const estrictas = ['A', 'B', 'C'];
  const relajadas = ['A', 'B', 'C', 'D', 'E'];
  const r = marcarRelajadas(estrictas, relajadas);
  assert.deepEqual(r, [
    { id: 'A', relajada: false }, { id: 'B', relajada: false }, { id: 'C', relajada: false },
    { id: 'D', relajada: true }, { id: 'E', relajada: true },
  ]);
});

test('sin relleno (mismo conjunto) ninguna queda relajada', () => {
  const r = marcarRelajadas(['A', 'B'], ['A', 'B']);
  assert.deepEqual(r, [{ id: 'A', relajada: false }, { id: 'B', relajada: false }]);
});
