import test from 'node:test';
import assert from 'node:assert/strict';
import { definicionSegmentoSchema, campanaInputSchema } from './validation.ts';

test('acepta operador mayor_que sobre campo numerico', () => {
  const r = definicionSegmentoSchema.safeParse({
    condiciones: [{ campo: 'usuarios', op: 'mayor_que', valor: 200000 }],
  });
  assert.equal(r.success, true);
});

test('rechaza mayor_que sobre campo no numerico', () => {
  const r = definicionSegmentoSchema.safeParse({
    condiciones: [{ campo: 'ciudad', op: 'mayor_que', valor: 5 }],
  });
  assert.equal(r.success, false);
});

test('acepta departamento y rol (string) y personas (numerico)', () => {
  const r = definicionSegmentoSchema.safeParse({
    condiciones: [
      { campo: 'departamento', op: 'en', valores: ['Valle del Cauca'] },
      { campo: 'rol', op: 'en', valores: ['gerente', 'dueno'] },
      { campo: 'personas', op: 'mayor_que', valor: 1 },
    ],
  });
  assert.equal(r.success, true);
});

test('campanaInputSchema default reglaFaltante = cola', () => {
  const r = campanaInputSchema.parse({ nombre: 'X', idCadencia: 1, idSegmento: 1 });
  assert.equal(r.reglaFaltante, 'cola');
});

test('campanaInputSchema rechaza regla desconocida', () => {
  const r = campanaInputSchema.safeParse({ nombre: 'X', idCadencia: 1, idSegmento: 1, reglaFaltante: 'inventada' });
  assert.equal(r.success, false);
});

test('campanaInputSchema acepta intakeDiario positivo y lo deja undefined si no viene', () => {
  const sinIntake = campanaInputSchema.parse({ nombre: 'X', idCadencia: 1, idSegmento: 1 });
  assert.equal(sinIntake.intakeDiario, undefined);
  const conIntake = campanaInputSchema.parse({ nombre: 'X', idCadencia: 1, idSegmento: 1, intakeDiario: 50 });
  assert.equal(conIntake.intakeDiario, 50);
});
