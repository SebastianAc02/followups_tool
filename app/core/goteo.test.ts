// Fase 8, Task 8.2: goteo de ingreso. Cuantos contactos NUEVOS entran cada dia segun el
// ritmo elegido. Distinto del motor de cadencia (que reparte los TOQUES de una cuenta ya
// inscrita): esto reparte el ALTA de cuentas nuevas a la campana. Puro, determinista.
// Fechas de referencia: 2026-07-07 martes (habil), 2026-07-11 sabado, 2026-07-12 domingo.

import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularGoteo } from './goteo.ts';

const MARTES = '2026-07-07'; // dia habil

test('ritmo diario: el cupo completo entra cada dia habil, sin saltar ninguno', () => {
  const r = calcularGoteo(4, 20, 'diario', MARTES);
  // el intake (20) es mayor que el total (4): todo entra el primer dia habil.
  assert.deepEqual(r.porDia, [{ fecha: MARTES, cuantos: 4 }]);
  assert.equal(r.diasHabiles, 1);
});

test('ritmo diario: 100 con intake 20/dia tarda 5 dias habiles, uno por cada dia', () => {
  const r = calcularGoteo(100, 20, 'diario', MARTES);
  assert.equal(r.diasHabiles, 5);
  assert.equal(r.porDia.length, 5);
  assert.ok(r.porDia.every((d) => d.cuantos === 20));
  // arranca martes 07-07, sigue mie/jue/vie/lun (salta el fin de semana 07-11/12)
  assert.deepEqual(
    r.porDia.map((d) => d.fecha),
    ['2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-13'],
  );
  assert.equal(r.porDia.reduce((s, d) => s + d.cuantos, 0), 100);
});

test('dia_si_dia_no: el cupo completo (no la mitad) entra en cada dia activo, arrancando hoy', () => {
  const r = calcularGoteo(4, 20, 'dia_si_dia_no', MARTES);
  // total (4) cabe entero en el primer dia activo -> un solo dia, cupo completo.
  assert.deepEqual(r.porDia, [{ fecha: MARTES, cuantos: 4 }]);
  assert.equal(r.diasHabiles, 1);
});

test('dia_si_dia_no: con mas total que el intake, los dias "no" no meten a nadie', () => {
  // intake 20, total 45: dia1 (activo, martes 07-07) entra 20, dia2 (07-08, inactivo) nada,
  // dia3 (07-09, activo) entra 20, dia4 (07-10, inactivo) nada, dia5 (07-13, activo, salta
  // finde) entra los 5 restantes.
  const r = calcularGoteo(45, 20, 'dia_si_dia_no', MARTES);
  assert.deepEqual(r.porDia, [
    { fecha: '2026-07-07', cuantos: 20 },
    { fecha: '2026-07-09', cuantos: 20 },
    { fecha: '2026-07-13', cuantos: 5 },
  ]);
  // diasHabiles cuenta dias de calendario habiles transcurridos hasta terminar el reparto
  // (incluye los dias "no" que sí son habiles, solo que no meten gente).
  assert.equal(r.diasHabiles, 5);
});

test('personalizado: placeholder, se comporta igual que diario (documentado, no hay mas spec)', () => {
  const diario = calcularGoteo(100, 20, 'diario', MARTES);
  const personalizado = calcularGoteo(100, 20, 'personalizado', MARTES);
  assert.deepEqual(personalizado, diario);
});

test('respeta dias habiles: arrancar en sabado corre el primer ingreso al lunes', () => {
  const SABADO = '2026-07-11';
  const r = calcularGoteo(5, 20, 'diario', SABADO);
  assert.deepEqual(r.porDia, [{ fecha: '2026-07-13', cuantos: 5 }]);
});

test('total 0: no hay nada que repartir', () => {
  const r = calcularGoteo(0, 20, 'diario', MARTES);
  assert.deepEqual(r.porDia, []);
  assert.equal(r.diasHabiles, 0);
});
