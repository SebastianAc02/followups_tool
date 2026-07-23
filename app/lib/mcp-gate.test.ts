// Pruebas del gate de acceso al MCP (Fase 6, docs/superpowers/specs/2026-07-23-mcp-oauth-login-design.md).
// puedeQuerearMcp es pura (solo lee el UsuarioSesion, sin DB): se prueba directo, sin DB de
// prueba ni servidor, mismo criterio que resolucion-sesion.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { puedeQuerearMcp } from './mcp-gate.ts';
import type { UsuarioSesion } from './session-user.ts';

function sesion(parcial: Partial<UsuarioSesion> = {}): UsuarioSesion {
  return {
    id: 'u1',
    email: 'u1@onepay.test',
    owner: 'Sebastian Acosta Molina',
    admin: false,
    idOrganizacion: 1,
    soloLectura: false,
    verTodoPipeline: false,
    ...parcial,
  };
}

test('admin pasa el gate', () => {
  assert.equal(puedeQuerearMcp(sesion({ admin: true, owner: '', soloLectura: false })), true);
});

test('verTodoPipeline (Camilo) pasa el gate sin ser admin', () => {
  assert.equal(puedeQuerearMcp(sesion({ verTodoPipeline: true, owner: '' })), true);
});

test('owner real de Onepay (no admin, no verTodoPipeline) pasa el gate', () => {
  assert.equal(puedeQuerearMcp(sesion({ owner: 'Felipe Castro', soloLectura: false })), true);
});

test('Visitante logueado (soloLectura) NO pasa el gate aunque tenga un owner freeform', () => {
  assert.equal(puedeQuerearMcp(sesion({ owner: 'Juan Visitante', soloLectura: true })), false);
});

test('sin owner, sin admin, sin verTodoPipeline: no pasa', () => {
  assert.equal(puedeQuerearMcp(sesion({ owner: '', soloLectura: false })), false);
});

test('Visitante con admin/verTodoPipeline en false y soloLectura true: no pasa aunque no sea el caso real de hoy', () => {
  assert.equal(puedeQuerearMcp(sesion({ admin: false, verTodoPipeline: false, owner: 'x', soloLectura: true })), false);
});
