import test from 'node:test';
import assert from 'node:assert/strict';
import { definicionSegmentoSchema } from './validation.ts';

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
