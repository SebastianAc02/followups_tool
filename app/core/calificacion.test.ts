import test from 'node:test';
import assert from 'node:assert/strict';
import { calificar, CAMPOS_CALIFICACION } from './calificacion.ts';

test('calificar marca presente el campo con valor y ausente el vacio', () => {
  const r = calificar({ usuarios: 1240, crm: 'Zoho', pasarela: null, recaudo: '' });
  const porNombre = Object.fromEntries(r.items.map((i) => [i.campo, i]));
  assert.equal(porNombre.usuarios.estado, 'tengo');
  assert.equal(porNombre.usuarios.valor, '1.240'); // es-CO real (ya usado en HubHeader/TablaCuentas): punto de miles
  assert.equal(porNombre.crm.estado, 'tengo');
  assert.equal(porNombre.pasarela.estado, 'preguntar');
  assert.equal(porNombre.recaudo.estado, 'preguntar');
});

test('calificar cuenta cuantos tengo sobre el total de imprescindibles', () => {
  const r = calificar({ usuarios: 10, crm: 'X', pasarela: 'Y', recaudo: null });
  assert.equal(r.tengo, 3);
  assert.equal(r.total, CAMPOS_CALIFICACION.length);
});

test('calificar formatea usuarios con separador de miles y deja 0 como ausente logico', () => {
  const r = calificar({ usuarios: null, crm: null, pasarela: null, recaudo: null });
  assert.equal(r.tengo, 0);
});
