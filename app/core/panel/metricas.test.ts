import test from 'node:test';
import assert from 'node:assert/strict';
import { resolverMetrica } from './metricas.ts';

test('dataSource conocido devuelve valor real', () => {
  const r = resolverMetrica('toquesTotal', { toquesTotal: 42 });
  assert.deepEqual(r, { estado: 'ok', valor: 42 });
});

test('dataSource null (sin fuente en el catalogo) devuelve sin_datos', () => {
  const r = resolverMetrica(null, {});
  assert.equal(r.estado, 'sin_datos');
});

test('dataSource conocido pero sin dato calculado por el caller devuelve sin_datos', () => {
  const r = resolverMetrica('campanasActivas', {});
  assert.equal(r.estado, 'sin_datos');
});

test('tiempoPromedioPorEtapa: barras por etapa', () => {
  const r = resolverMetrica('tiempoPromedioPorEtapa', { tiempoPromedioPorEtapa: { contacto_iniciado: 3, reunion_agendada: 5 } });
  assert.deepEqual(r, { estado: 'ok', valor: { contacto_iniciado: 3, reunion_agendada: 5 } });
});

test('cicloVentaPromedio: null (calculado, sin cierres) es sin_datos, no un 0 inventado', () => {
  const r = resolverMetrica('cicloVentaPromedio', { cicloVentaPromedio: null });
  assert.equal(r.estado, 'sin_datos');
});

test('cicloVentaPromedio: con valor real es ok', () => {
  const r = resolverMetrica('cicloVentaPromedio', { cicloVentaPromedio: 14.5 });
  assert.deepEqual(r, { estado: 'ok', valor: 14.5 });
});

test('velocidadCambioEtapa y mrrEstimadoTotal: ok cuando el caller los calculo', () => {
  assert.deepEqual(resolverMetrica('velocidadCambioEtapa', { velocidadCambioEtapa: 0.5 }), { estado: 'ok', valor: 0.5 });
  assert.deepEqual(resolverMetrica('mrrEstimadoTotal', { mrrEstimadoTotal: 1200000 }), { estado: 'ok', valor: 1200000 });
});

// Widgets conectados 2026-07-22: los 5 dataSources nuevos deben devolver 'ok' (nunca
// sin_datos) cuando el caller ya calculo el dato -- incluye el caso 0/objeto vacio, que
// es un numero real (0 deals nuevos, ningun toque todavia), no "no lo calcule".
test('dealsNuevosEnRango / reunionesAgendadasEnRango: ok incluso en 0 (dato real, no sin_datos)', () => {
  assert.deepEqual(resolverMetrica('dealsNuevosEnRango', { dealsNuevosEnRango: 0 }), { estado: 'ok', valor: 0 });
  assert.deepEqual(resolverMetrica('reunionesAgendadasEnRango', { reunionesAgendadasEnRango: 3 }), { estado: 'ok', valor: 3 });
});

test('followUpPorDeal: ok con el promedio ya calculado por el caller', () => {
  assert.deepEqual(resolverMetrica('followUpPorDeal', { followUpPorDeal: 2.5 }), { estado: 'ok', valor: 2.5 });
});

test('segmentacionPorPersona: ok con el Record por categoria', () => {
  const r = resolverMetrica('segmentacionPorPersona', { segmentacionPorPersona: { dueno: 5, gerente: 2 } });
  assert.deepEqual(r, { estado: 'ok', valor: { dueno: 5, gerente: 2 } });
});

test('toquesAntesDeCerrarPromedio: null (nadie cerro) es sin_datos, un numero real es ok', () => {
  assert.equal(resolverMetrica('toquesAntesDeCerrarPromedio', { toquesAntesDeCerrarPromedio: null }).estado, 'sin_datos');
  assert.deepEqual(resolverMetrica('toquesAntesDeCerrarPromedio', { toquesAntesDeCerrarPromedio: 1.5 }), { estado: 'ok', valor: 1.5 });
});

test('los 5 dataSources nuevos: sin_datos cuando el caller no calculo nada (undefined)', () => {
  assert.equal(resolverMetrica('dealsNuevosEnRango', {}).estado, 'sin_datos');
  assert.equal(resolverMetrica('reunionesAgendadasEnRango', {}).estado, 'sin_datos');
  assert.equal(resolverMetrica('followUpPorDeal', {}).estado, 'sin_datos');
  assert.equal(resolverMetrica('segmentacionPorPersona', {}).estado, 'sin_datos');
  assert.equal(resolverMetrica('toquesAntesDeCerrarPromedio', {}).estado, 'sin_datos');
});
