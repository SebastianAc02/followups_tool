// V4.6: la prueba mas densa del proyecto. Motor de fechas EN SECO, puro. Cubre offsets,
// dias bloqueados, corrimiento en ambas direcciones, re-anclaje tras atraso y la garantia
// de que un worker caido no dispara pasos en rafaga.
// Fechas de referencia (verificadas): 2026-07-06 lunes, 2026-07-11 sabado,
// 2026-07-12 domingo, 2026-07-13 lunes.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularCalendario,
  proximoPasoDebido,
  type ConfigCalendario,
  type PasoOffset,
} from './motor-cadencia.ts';

const SIN_BLOQUEO: ConfigCalendario = { diasBloqueados: [], corrimiento: 'siguiente' };
const DOMINGO_SIG: ConfigCalendario = { diasBloqueados: [0], corrimiento: 'siguiente' };
const DOMINGO_ANT: ConfigCalendario = { diasBloqueados: [0], corrimiento: 'anterior' };
const PASOS: PasoOffset[] = [
  { orden: 1, diaOffset: 0 },
  { orden: 2, diaOffset: 3 },
  { orden: 3, diaOffset: 7 },
];
const ANCHOR = '2026-07-06'; // lunes

// --- calcularCalendario (plan ideal, sin atrasos) ---

test('1. offsets sin dias bloqueados: fecha = anchor + offset, sin corrimiento', () => {
  const cal = calcularCalendario(PASOS, ANCHOR, SIN_BLOQUEO);
  assert.deepEqual(
    cal.map((p) => p.fecha),
    ['2026-07-06', '2026-07-09', '2026-07-13'],
  );
  assert.ok(cal.every((p) => p.fecha === p.fechaNatural), 'sin bloqueo, fecha == natural');
});

test('2. paso que cae en domingo con corrimiento siguiente pasa al lunes', () => {
  // offset 6 desde lunes 07-06 = domingo 07-12 -> lunes 07-13
  const cal = calcularCalendario([{ orden: 1, diaOffset: 6 }], ANCHOR, DOMINGO_SIG);
  assert.equal(cal[0].fechaNatural, '2026-07-12');
  assert.equal(cal[0].fecha, '2026-07-13');
});

test('3. mismo paso con corrimiento anterior pasa al sabado', () => {
  const cal = calcularCalendario([{ orden: 1, diaOffset: 6 }], ANCHOR, DOMINGO_ANT);
  assert.equal(cal[0].fecha, '2026-07-11');
});

test('4. fin de semana bloqueado (sab+dom) con siguiente salta al lunes', () => {
  const cfg: ConfigCalendario = { diasBloqueados: [6, 0], corrimiento: 'siguiente' };
  // offset 5 desde lunes 07-06 = sabado 07-11 -> salta dom -> lunes 07-13
  const cal = calcularCalendario([{ orden: 1, diaOffset: 5 }], ANCHOR, cfg);
  assert.equal(cal[0].fecha, '2026-07-13');
});

test('5. semana entera bloqueada lanza (no gira para siempre)', () => {
  const cfg: ConfigCalendario = { diasBloqueados: [0, 1, 2, 3, 4, 5, 6], corrimiento: 'siguiente' };
  assert.throws(() => calcularCalendario([{ orden: 1, diaOffset: 0 }], ANCHOR, cfg), /no converge/);
});

// --- proximoPasoDebido (motor real, re-anclaje + anti-rafaga) ---

test('6. nada ejecutado: el primer paso esta debido en el anchor', () => {
  const debido = proximoPasoDebido(PASOS, { anchor: ANCHOR, ejecutados: [] }, ANCHOR, SIN_BLOQUEO);
  assert.equal(debido?.orden, 1);
  assert.equal(debido?.fechaObjetivo, ANCHOR);
});

test('7. paso futuro no esta debido todavia (objetivo > hoy -> null)', () => {
  // paso 1 ejecutado hoy; el paso 2 (offset 3) queda para dentro de 3 dias
  const estado = { anchor: ANCHOR, ejecutados: [{ orden: 1, fechaReal: ANCHOR }] };
  const debido = proximoPasoDebido(PASOS, estado, ANCHOR, SIN_BLOQUEO);
  assert.equal(debido, null);
});

test('8. cadencia terminada (todos ejecutados) -> null', () => {
  const estado = {
    anchor: ANCHOR,
    ejecutados: [
      { orden: 1, fechaReal: '2026-07-06' },
      { orden: 2, fechaReal: '2026-07-09' },
      { orden: 3, fechaReal: '2026-07-13' },
    ],
  };
  assert.equal(proximoPasoDebido(PASOS, estado, '2026-07-20', SIN_BLOQUEO), null);
});

test('9. re-anclaje: el paso 2 se mide desde la fecha REAL del paso 1, no desde el anchor', () => {
  // paso 1 salio tarde el jueves 07-09 (no el lunes). paso 2 (delta 3) -> domingo 07-12,
  // que con corrimiento siguiente cae en lunes 07-13, NO en 07-09+... desde el anchor.
  const estado = { anchor: ANCHOR, ejecutados: [{ orden: 1, fechaReal: '2026-07-09' }] };
  const debido = proximoPasoDebido(PASOS, estado, '2026-07-20', DOMINGO_SIG);
  assert.equal(debido?.orden, 2);
  assert.equal(debido?.fechaObjetivo, '2026-07-13', 'objetivo = fechaReal1 (07-09) + delta 3 = 07-12 dom -> 07-13');
});

test('10. worker caido 10 dias: solo UN paso debido, sin rafaga', () => {
  // hoy = anchor + 10 (2026-07-16). Naive dispararia pasos 1,2,3 (todos con fecha
  // natural <= hoy). El motor devuelve solo el paso 1.
  const hoy = '2026-07-16';
  const estado = { anchor: ANCHOR, ejecutados: [] };

  const primero = proximoPasoDebido(PASOS, estado, hoy, SIN_BLOQUEO);
  assert.equal(primero?.orden, 1, 'solo el primer paso, no los tres');

  // se ejecuta el paso 1 HOY (tarde). el paso 2 se re-ancla a hoy + 3, NO queda debido ya.
  const estado2 = { anchor: ANCHOR, ejecutados: [{ orden: 1, fechaReal: hoy }] };
  const segundo = proximoPasoDebido(PASOS, estado2, hoy, SIN_BLOQUEO);
  assert.equal(segundo, null, 'el paso 2 espera 3 dias desde el envio real, no dispara junto');

  // 3 dias despues si toca el paso 2, y solo ese
  const trasTres = proximoPasoDebido(PASOS, estado2, '2026-07-19', SIN_BLOQUEO);
  assert.equal(trasTres?.orden, 2);
});

test('11. re-anclaje respeta dias bloqueados en el objetivo', () => {
  // paso 1 real sabado 07-11; paso 2 delta 3 -> 07-14 (martes, habil) -> queda 07-14.
  const estado = { anchor: ANCHOR, ejecutados: [{ orden: 1, fechaReal: '2026-07-11' }] };
  const debido = proximoPasoDebido(PASOS, estado, '2026-07-20', DOMINGO_SIG);
  assert.equal(debido?.fechaObjetivo, '2026-07-14');
});
