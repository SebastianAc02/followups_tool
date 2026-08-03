import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIAS_EMPRESA,
  CATEGORIAS_ESCRIBIBLES,
  CATEGORIA_PRUEBA,
  categoriaAceptada,
  categoriaPorDefecto,
} from './empresa-identidad.ts';

// El alcance del brain (solo ISP) y los conteos por categoria leen CATEGORIAS_EMPRESA: si
// 'test' se cuela ahi, una cuenta sembrada empieza a contar como cuenta real.
test("'test' no entra a las categorias de negocio", () => {
  assert.deepEqual([...CATEGORIAS_EMPRESA], ['isp', 'utility', 'otro']);
  assert.equal((CATEGORIAS_EMPRESA as readonly string[]).includes(CATEGORIA_PRUEBA), false);
  assert.deepEqual([...CATEGORIAS_ESCRIBIBLES], ['isp', 'utility', 'otro', 'test']);
});

test('en modo prueba la cuenta nueva nace marcada test; fuera, isp', () => {
  assert.equal(categoriaPorDefecto(true), 'test');
  assert.equal(categoriaPorDefecto(false), 'isp');
});

test("'test' solo se acepta con el modo prueba prendido", () => {
  assert.equal(categoriaAceptada('test', true), true);
  assert.equal(categoriaAceptada('test', false), false);
});

test('las tres reales se aceptan en los dos modos', () => {
  for (const c of CATEGORIAS_EMPRESA) {
    assert.equal(categoriaAceptada(c, true), true);
    assert.equal(categoriaAceptada(c, false), true);
  }
});

test('una categoria inventada se rechaza aunque el modo prueba este prendido', () => {
  assert.equal(categoriaAceptada('agencia_viajes', true), false);
  assert.equal(categoriaAceptada('', false), false);
});
