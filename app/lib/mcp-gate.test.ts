// Pruebas del gate de acceso al MCP (Fase 6, docs/superpowers/specs/2026-07-23-mcp-oauth-login-design.md).
// puedeQuerearMcp es pura (solo lee el UsuarioSesion, sin DB): se prueba directo, sin DB de
// prueba ni servidor, mismo criterio que resolucion-sesion.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { puedeQuerearMcp, puedeEscribirMcp } from './mcp-gate.ts';
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
    escrituraMcp: false,
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

// write-path del MCP (2026-07-24): la escritura es un permiso SEPARADO del de lectura,
// revocable sin perder lectura. Se controla por el flag dedicado escrituraMcp.
test('escritura: un lector valido SIN el flag escrituraMcp no puede escribir (default cerrado)', () => {
  assert.equal(puedeEscribirMcp(sesion({ owner: 'Felipe Castro', escrituraMcp: false })), false);
});

test('escritura: un lector valido CON el flag escrituraMcp puede escribir', () => {
  assert.equal(puedeEscribirMcp(sesion({ owner: 'Felipe Castro', escrituraMcp: true })), true);
});

test('escritura: revocar escritura (escrituraMcp=false) NO quita lectura', () => {
  const s = sesion({ owner: 'Felipe Castro', escrituraMcp: false });
  assert.equal(puedeEscribirMcp(s), false);
  assert.equal(puedeQuerearMcp(s), true);
});

test('escritura: un Visitante (soloLectura) no escribe aunque tenga el flag encendido por error', () => {
  assert.equal(puedeEscribirMcp(sesion({ owner: 'Juan', soloLectura: true, escrituraMcp: true })), false);
});

test('escritura: admin NO gana escritura automatica sin el flag (permiso independiente)', () => {
  assert.equal(puedeEscribirMcp(sesion({ admin: true, owner: '', escrituraMcp: false })), false);
});
