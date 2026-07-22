import test from 'node:test';
import assert from 'node:assert/strict';
import { agregar, quitar, reordenar, parse, serialize, tableroDefault } from './tablero.ts';

test('agregar añade al final', () => {
  assert.deepEqual(agregar([], 'toques_total'), [{ widgetId: 'toques_total', span: 1 }]);
});

test('agregar es un no-op si el widget ya esta en el tablero', () => {
  const l = agregar([], 'toques_total');
  assert.deepEqual(agregar(l, 'toques_total'), l);
});

test('quitar elimina por indice', () => {
  const l = [{ widgetId: 'a', span: 1 }, { widgetId: 'b', span: 1 }];
  assert.deepEqual(quitar(l, 0).map((w) => w.widgetId), ['b']);
});

test('reordenar mueve un item', () => {
  const l = [{ widgetId: 'a', span: 1 }, { widgetId: 'b', span: 1 }];
  assert.deepEqual(reordenar(l, 0, 1).map((w) => w.widgetId), ['b', 'a']);
});

test('parse descarta widgets desconocidos', () => {
  assert.deepEqual(parse('[{"widgetId":"no_existe","span":1}]'), []);
});

test('parse conserva widgets validos y su span', () => {
  const layout = parse('[{"widgetId":"toques_total","span":3}]');
  assert.deepEqual(layout, [{ widgetId: 'toques_total', span: 3 }]);
});

test('parse descarta widgetIds repetidos (se queda con el primero)', () => {
  const layout = parse('[{"widgetId":"toques_total","span":2},{"widgetId":"toques_total","span":4}]');
  assert.deepEqual(layout, [{ widgetId: 'toques_total', span: 2 }]);
});

test('parse con JSON invalido devuelve []', () => {
  assert.deepEqual(parse('no es json'), []);
});

test('serialize/parse hacen roundtrip', () => {
  const original = agregar([], 'toques_total');
  assert.deepEqual(parse(serialize(original)), original);
});

test('tableroDefault trae SOLO las 4 metricas objetivas del CRO (sin probabilidad), todas del catalogo real', () => {
  const def = tableroDefault();
  assert.deepEqual(
    def.map((w) => w.widgetId),
    ['tiempo_en_etapa', 'lead_a_cliente', 'conversion_stage', 'mrr_estimado'],
  );
  assert.ok(def.every((w) => typeof w.widgetId === 'string' && w.span > 0));
});
