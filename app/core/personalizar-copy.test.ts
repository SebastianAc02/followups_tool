import test from 'node:test';
import assert from 'node:assert/strict';
import { resaltarVariables } from './personalizar-copy.ts';

test('resaltarVariables parte el texto en segmentos, marcando variables resueltas y sin resolver', () => {
  const segmentos = resaltarVariables('Hola [nombre] de [empresa]', { nombre: 'Hidaly' });
  assert.deepEqual(segmentos, [
    { texto: 'Hola ', esVariable: false, resuelta: false },
    { texto: 'Hidaly', esVariable: true, resuelta: true },
    { texto: ' de ', esVariable: false, resuelta: false },
    { texto: '[empresa]', esVariable: true, resuelta: false },
  ]);
});

test('resaltarVariables texto sin variables devuelve un solo segmento', () => {
  const segmentos = resaltarVariables('Hola mundo', {});
  assert.deepEqual(segmentos, [{ texto: 'Hola mundo', esVariable: false, resuelta: false }]);
});

test('resaltarVariables variable repetida se resuelve en ambas apariciones', () => {
  const segmentos = resaltarVariables('[nombre] y [nombre]', { nombre: 'Ana' });
  assert.deepEqual(segmentos, [
    { texto: 'Ana', esVariable: true, resuelta: true },
    { texto: ' y ', esVariable: false, resuelta: false },
    { texto: 'Ana', esVariable: true, resuelta: true },
  ]);
});
