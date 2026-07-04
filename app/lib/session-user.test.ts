import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usuarioDeSesion } from './session-user.ts';

test('usa el campo owner cuando existe', () => {
  const u = usuarioDeSesion({
    email: 'sacostamolin@gmail.com',
    name: 'Sebastián Acosta',
    owner: 'Sebastian Acosta Molina',
    admin: true,
  });
  assert.equal(u.owner, 'Sebastian Acosta Molina');
  assert.equal(u.admin, true);
});

test('cae al name si owner viene vacio (usuario sin mapear)', () => {
  const u = usuarioDeSesion({ email: 'x@y.co', name: 'Felipe Castro', owner: null, admin: null });
  assert.equal(u.owner, 'Felipe Castro');
  assert.equal(u.admin, false);
});
