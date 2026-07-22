import test from 'node:test';
import assert from 'node:assert/strict';
import { WIDGETS, widgetPorId } from './widgets.ts';

test('cada widget tiene id unico', () => {
  const ids = WIDGETS.map((w) => w.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('widgetPorId devuelve el widget o undefined', () => {
  assert.equal(widgetPorId('deals_nuevos')?.tipo, 'kpi');
  assert.equal(widgetPorId('no_existe'), undefined);
});

// Decision de Sebastian (2026-07-22): un widget sin fuente real se SACA del catalogo, no
// se deja en null. Los 6 de abajo no tienen dato hoy (ni monto/deal size en la DB, ni
// señal de presento/reagendo/perdido, probabilidad ya descartada por subjetiva).
test('los 6 widgets sin fuente real se sacaron del catalogo', () => {
  for (const id of ['show_rate', 'reschedule_rate', 'weighted_pipeline', 'ticket_promedio', 'matar_deal_post_reunion', 'probabilidad_cierre']) {
    assert.equal(widgetPorId(id), undefined, `${id} no deberia estar en el catalogo`);
  }
});

test('los 4 widgets conectados 2026-07-22 tienen dataSource real (no null)', () => {
  for (const id of ['deals_nuevos', 'reuniones_agendadas', 'follow_up_por_deal', 'segmentacion_persona']) {
    assert.ok(widgetPorId(id)?.dataSource, `${id} deberia tener dataSource`);
  }
});

test('toques_antes_cerrar (borderline): se resolvio a favor con firma_pago como señal de cerrado', () => {
  assert.equal(widgetPorId('toques_antes_cerrar')?.dataSource, 'toquesAntesDeCerrarPromedio');
});

test('ningun widget del catalogo tiene dataSource null (todos los que no tenian fuente se sacaron)', () => {
  assert.ok(WIDGETS.every((w) => w.dataSource !== null));
});
