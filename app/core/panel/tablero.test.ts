import test from 'node:test';
import assert from 'node:assert/strict';
import { agregar, quitar, reordenar, parse, serialize, tableroDefault, incorporarWidgetsNuevos } from './tablero.ts';
import { widgetPorId } from './widgets.ts';

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

// De 4 a 9 el 2026-08-05, por pedido del operador: el CRO abre el panel para ver la actividad del
// dia y eso no estaba. Las cinco nuevas NO contradicen la decision del 22-jul que dejo el default en
// cuatro: esa decision se tomo porque el default traia ~24 widgets, la mayoria SIN DATOS, y enterraba
// los que importan. Estas cinco tienen dato real desde el primer dia y son justo las que el operador
// dijo que quiere ver. El criterio sigue siendo el mismo, lo que cambio es que ahora hay cinco
// metricas que lo cumplen.
test('tableroDefault trae las 4 metricas objetivas del CRO mas las 7 de actividad y origen, todas del catalogo real', () => {
  const def = tableroDefault();
  assert.deepEqual(
    def.map((w) => w.widgetId),
    [
      'tiempo_en_etapa',
      'lead_a_cliente',
      'conversion_stage',
      'mrr_estimado',
      'connect_rate',
      'connect_rate_detalle',
      'toques_por_grupo_canal',
      'texto_dedup',
      'llamadas_cuentas_nuevas',
      'conversion_por_origen',
      'cobertura_origen_lead',
    ],
  );
  assert.ok(def.every((w) => typeof w.widgetId === 'string' && w.span > 0));
  // Ningun widget del default puede quedar sin fuente: un default que abre con "sin datos" es
  // exactamente lo que la decision del 22-jul vino a arreglar.
  assert.ok(def.every((w) => widgetPorId(w.widgetId)?.dataSource != null), 'todo widget del default tiene fuente real');
});

// La incorporacion a un tablero YA guardado. Sin esto, la metrica nueva solo la ve quien nunca
// guardo el suyo, que es la forma mas silenciosa de construir algo que nadie usa.
test('un tablero guardado recibe los widgets nuevos sin perder los que ya tenia ni su orden', () => {
  const guardado = [{ widgetId: 'toques_total', span: 1 }, { widgetId: 'mrr_estimado', span: 2 }];
  const despues = incorporarWidgetsNuevos(guardado);

  assert.deepEqual(despues.slice(0, 2), guardado, 'lo que el usuario tenia queda igual y de primero');
  assert.ok(despues.some((w) => w.widgetId === 'connect_rate'));
  assert.equal(despues.length, guardado.length + 7);
});

test('incorporar dos veces no duplica nada', () => {
  const una = incorporarWidgetsNuevos([{ widgetId: 'toques_total', span: 1 }]);
  assert.deepEqual(incorporarWidgetsNuevos(una), una);
});
