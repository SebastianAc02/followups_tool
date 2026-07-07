import test from 'node:test';
import assert from 'node:assert/strict';
import { contarCerradas } from './stats.ts';

test('contarCerradas: es el total de contadoresHoy', () => {
  assert.equal(
    contarCerradas({ porCanal: { llamada: 0, whatsapp: 0, correo: 0 }, porResultado: {
      contesto_reunion: 1, contesto_sigue_seguimiento: 0, contesto_no: 2, no_contesto: 0,
    }, total: 3 }),
    3,
  );
});

test('contarCerradas: sin toques hoy da cero', () => {
  assert.equal(
    contarCerradas({ porCanal: { llamada: 0, whatsapp: 0, correo: 0 }, porResultado: {
      contesto_reunion: 0, contesto_sigue_seguimiento: 0, contesto_no: 0, no_contesto: 0,
    }, total: 0 }),
    0,
  );
});
