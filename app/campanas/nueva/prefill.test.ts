import test from 'node:test';
import assert from 'node:assert/strict';
import { prefillSegmentoDesdeQuery } from './prefill.ts';

test('prefillSegmentoDesdeQuery: sin estado, no arma nada', () => {
  assert.equal(prefillSegmentoDesdeQuery({}), undefined);
  assert.equal(prefillSegmentoDesdeQuery({ owner: 'Felipe Castro' }), undefined);
});

test('prefillSegmentoDesdeQuery: con estado, arma la condicion de estado', () => {
  const def = prefillSegmentoDesdeQuery({ estado: 'contacto_iniciado' });
  assert.deepEqual(def, { condiciones: [{ campo: 'estado', op: 'en', valores: ['contacto_iniciado'] }] });
});

test('prefillSegmentoDesdeQuery: con estado y owner, arma ambas condiciones', () => {
  const def = prefillSegmentoDesdeQuery({ estado: 'contacto_iniciado', owner: 'Felipe Castro' });
  assert.deepEqual(def, {
    condiciones: [
      { campo: 'estado', op: 'en', valores: ['contacto_iniciado'] },
      { campo: 'owner', op: 'en', valores: ['Felipe Castro'] },
    ],
  });
});
