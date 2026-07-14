// Autoridad de guardado de credencial, pura y sin DB. admin-mode: solo admin, credencial
// global. personal-mode: cualquier miembro, credencial propia.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decidirGuardado, puedeRevelarCredencial } from './politica.ts';

test('admin-mode + admin: permitido, scope global', () => {
  assert.deepEqual(decidirGuardado('admin', true), { permitido: true, scope: 'global' });
});

test('admin-mode + miembro: NO permitido', () => {
  assert.deepEqual(decidirGuardado('admin', false), { permitido: false });
});

test('personal-mode + miembro: permitido, scope personal', () => {
  assert.deepEqual(decidirGuardado('personal', false), { permitido: true, scope: 'personal' });
});

test('personal-mode + admin: permitido, scope personal (el admin tambien tiene su propia cuenta)', () => {
  assert.deepEqual(decidirGuardado('personal', true), { permitido: true, scope: 'personal' });
});

test('puedeRevelarCredencial: admin puede revelar un conector modo admin', () => {
  assert.strictEqual(puedeRevelarCredencial('admin', true), true);
});

test('puedeRevelarCredencial: no-admin nunca puede revelar, ni siquiera un conector admin', () => {
  assert.strictEqual(puedeRevelarCredencial('admin', false), false);
});

test('puedeRevelarCredencial: ni un admin puede revelar un conector modo personal (es de otra persona)', () => {
  assert.strictEqual(puedeRevelarCredencial('personal', true), false);
});
