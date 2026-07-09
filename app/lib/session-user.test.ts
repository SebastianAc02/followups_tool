import test from 'node:test';
import assert from 'node:assert/strict';
import { usuarioDeSesion } from './session-user.ts';

test('usuarioDeSesion incluye idOrganizacion tal cual se lo pasan', () => {
  const sesion = usuarioDeSesion(
    { id: 'u1', email: 'a@b.com', name: 'Ana', owner: 'Ana Owner', admin: false },
    7,
  );
  assert.equal(sesion.idOrganizacion, 7);
});

test('usuarioDeSesion sigue mapeando owner con fallback a name', () => {
  const sesion = usuarioDeSesion(
    { id: 'u1', email: 'a@b.com', name: 'Ana', owner: null, admin: true },
    1,
  );
  assert.equal(sesion.owner, 'Ana');
  assert.equal(sesion.admin, true);
});
