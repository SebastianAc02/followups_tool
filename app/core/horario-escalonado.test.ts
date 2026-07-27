// Reparto de horas de un lote. Core puro, sin DB ni reloj: mismas entradas, misma salida.
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularHorarioEscalonado } from './horario-escalonado.ts';

// El caso real que motivo la funcion: siete aperturas a las 11:00, una cada dos minutos.
test('siete mensajes desde las 11:00, uno cada dos minutos', () => {
  const h = calcularHorarioEscalonado('2026-07-27T11:00:00.000Z', 7, 2 * 60_000);
  assert.deepEqual(
    h.map((p) => p.fechaProgramada),
    [
      '2026-07-27T11:00:00.000Z',
      '2026-07-27T11:02:00.000Z',
      '2026-07-27T11:04:00.000Z',
      '2026-07-27T11:06:00.000Z',
      '2026-07-27T11:08:00.000Z',
      '2026-07-27T11:10:00.000Z',
      '2026-07-27T11:12:00.000Z',
    ],
  );
  assert.equal(h[0].posicion, 0);
});

test('el primero sale a la hora pedida, sin corrimiento', () => {
  const [primero] = calcularHorarioEscalonado('2026-07-27T11:00:00.000Z', 1, 120_000);
  assert.equal(primero.fechaProgramada, '2026-07-27T11:00:00.000Z');
});

// Espaciado 0 no es un error: es "todos elegibles de una", que es lo correcto cuando el ritmo
// lo pone el worker y no el calendario.
test('espaciado 0 deja todo el lote a la misma hora', () => {
  const h = calcularHorarioEscalonado('2026-07-27T11:00:00.000Z', 3, 0);
  assert.deepEqual(new Set(h.map((p) => p.fechaProgramada)).size, 1);
});

test('cruza la medianoche sin romperse', () => {
  const h = calcularHorarioEscalonado('2026-07-27T23:58:00.000Z', 2, 2 * 60_000);
  assert.equal(h[1].fechaProgramada, '2026-07-28T00:00:00.000Z');
});

test('un lote vacio devuelve vacio, no truena', () => {
  assert.deepEqual(calcularHorarioEscalonado('2026-07-27T11:00:00.000Z', 0, 120_000), []);
});

// Entrada mala falla RUIDOSA. Una hora invalida que devolviera "Invalid Date" en silencio
// dejaria siete mensajes programados para una fecha que no existe, y eso solo se descubre
// cuando no salen.
test('una hora invalida truena en vez de programar basura', () => {
  assert.throws(() => calcularHorarioEscalonado('mañana a las 11', 3, 120_000), /hora de inicio invalida/);
  // V8 acepta prosa: new Date('mañana a las 11') NO da Invalid Date, da una fecha inventada a
  // partir del 11. Por eso la forma se valida con regex antes de construir el Date.
  assert.throws(() => calcularHorarioEscalonado('27 de julio 11am', 3, 120_000), /hora de inicio invalida/);
  assert.throws(() => calcularHorarioEscalonado('2026-13-45', 3, 120_000), /hora de inicio invalida/);
  assert.throws(() => calcularHorarioEscalonado('2026-07-27T11:00:00.000Z', 3, -1), /espaciado invalido/);
  assert.throws(() => calcularHorarioEscalonado('2026-07-27T11:00:00.000Z', 1.5, 120_000), /cantidad invalida/);
});
