// V7.1a: pruebas del modulo core puro de la ventana de actividad (Fase 7).

import test from 'node:test';
import assert from 'node:assert/strict';
import { esDiaHabil, restarUnDia, ventanaPromedio, promedioDiario, DIAS_HABILES } from './actividad.ts';

test('esDiaHabil: lunes a viernes true, sabado y domingo false', () => {
  // 2026-01-01 es jueves; 03 sabado, 04 domingo, 05 lunes.
  assert.equal(esDiaHabil('2026-01-01'), true);  // jueves
  assert.equal(esDiaHabil('2026-01-02'), true);  // viernes
  assert.equal(esDiaHabil('2026-01-03'), false); // sabado
  assert.equal(esDiaHabil('2026-01-04'), false); // domingo
  assert.equal(esDiaHabil('2026-01-05'), true);  // lunes
});

test('esDiaHabil acepta datetime ISO completo, mira solo la fecha', () => {
  assert.equal(esDiaHabil('2026-01-03T14:30:00.000Z'), false); // sabado con hora
});

test('restarUnDia cruza fin de mes', () => {
  assert.equal(restarUnDia('2026-02-01'), '2026-01-31');
  assert.equal(restarUnDia('2026-01-15'), '2026-01-14');
});

test('ventanaPromedio: hasta es ayer, y quedan 7 dias habiles en el rango', () => {
  // hoy jueves 2026-01-15; ayer miercoles 14. Contando 7 habiles hacia atras:
  // 14,13,12, (11 dom,10 sab), 9,8,7,6 -> desde = martes 2026-01-06.
  const v = ventanaPromedio('2026-01-15');
  assert.deepEqual(v, { desde: '2026-01-06', hasta: '2026-01-14' });
});

test('ventanaPromedio: cuando ayer cae en fin de semana igual arranca en ayer', () => {
  // hoy lunes 2026-01-05; ayer domingo 04 (no habil, pero es el borde superior).
  const v = ventanaPromedio('2026-01-05');
  assert.equal(v.hasta, '2026-01-04'); // ayer literal, aunque sea domingo
  assert.equal(esDiaHabil(v.desde), true); // el borde inferior siempre es habil
});

test('promedioDiario divide por el denominador fijo, no por dias de calendario', () => {
  assert.equal(DIAS_HABILES, 7);
  assert.equal(promedioDiario(35), 5);   // 35 toques / 7
  assert.equal(promedioDiario(0), 0);
  assert.equal(promedioDiario(10), 10 / 7); // no redondea aqui; la UI formatea
});
