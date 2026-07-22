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
