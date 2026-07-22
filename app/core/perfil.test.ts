// Fase 1 (abstraccion de Perfil): pruebas del builder puro (sin DB, sin sesion).

import test from 'node:test';
import assert from 'node:assert/strict';
import { construirPerfil, PREFERENCIAS_DEFAULT } from './perfil.ts';
import type { UsuarioSesion } from '../lib/session-user.ts';

function identidad(overrides: Partial<UsuarioSesion> = {}): UsuarioSesion {
  return {
    id: 'u1',
    email: 'a@onepay.co',
    owner: 'Sebastian Acosta Molina',
    admin: false,
    idOrganizacion: 1,
    soloLectura: false,
    verTodoPipeline: false,
    ...overrides,
  };
}

test('iniciales de nombre con dos tokens toma la primera letra de cada uno', () => {
  const perfil = construirPerfil(identidad({ owner: 'Sebastian Acosta Molina' }), PREFERENCIAS_DEFAULT);
  assert.equal(perfil.iniciales, 'SA');
});

test('nombre de un solo token usa solo esa letra (sin segundo token que aportar)', () => {
  const perfil = construirPerfil(identidad({ owner: 'Camilo' }), PREFERENCIAS_DEFAULT);
  assert.equal(perfil.iniciales, 'C');
});

test('owner vacio cae al fallback SV', () => {
  const perfil = construirPerfil(identidad({ owner: '' }), PREFERENCIAS_DEFAULT);
  assert.equal(perfil.iniciales, 'SV');
});

test('primer nombre para el saludo es el primer token', () => {
  const perfil = construirPerfil(identidad({ owner: 'Camilo Fonseca' }), PREFERENCIAS_DEFAULT);
  assert.equal(perfil.primerNombre, 'Camilo');
});

test('rol es Administrador cuando admin es true', () => {
  const perfil = construirPerfil(identidad({ admin: true }), PREFERENCIAS_DEFAULT);
  assert.equal(perfil.rol, 'Administrador');
});

test('rol es Vendedor cuando admin es false', () => {
  const perfil = construirPerfil(identidad({ admin: false }), PREFERENCIAS_DEFAULT);
  assert.equal(perfil.rol, 'Vendedor');
});

test('rol es CRO cuando verTodoPipeline es true, aunque admin sea false (Camilo no es admin)', () => {
  const perfil = construirPerfil(identidad({ verTodoPipeline: true, admin: false }), PREFERENCIAS_DEFAULT);
  assert.equal(perfil.rol, 'CRO');
  assert.equal(perfil.verTodoPipeline, true);
});

test('un admin normal (Sebastian) NO es CRO solo por ser admin', () => {
  const perfil = construirPerfil(identidad({ admin: true, verTodoPipeline: false }), PREFERENCIAS_DEFAULT);
  assert.equal(perfil.rol, 'Administrador');
});

test('preferencias resueltas pasan sin transformar al perfil', () => {
  const perfil = construirPerfil(identidad(), { ...PREFERENCIAS_DEFAULT, colorAvatar: 'rose', vistaInicio: '/cola' });
  assert.equal(perfil.colorAvatar, 'rose');
  assert.equal(perfil.vistaInicio, '/cola');
});

test('cargo y telefono resueltos pasan sin transformar al perfil', () => {
  const perfil = construirPerfil(identidad(), { ...PREFERENCIAS_DEFAULT, cargo: 'Lead de Ventas', telefono: '+57 300 000 0000' });
  assert.equal(perfil.cargo, 'Lead de Ventas');
  assert.equal(perfil.telefono, '+57 300 000 0000');
});

test('id y email vienen de la identidad, no de las preferencias', () => {
  const perfil = construirPerfil(identidad({ id: 'u42', email: 'x@onepay.co' }), PREFERENCIAS_DEFAULT);
  assert.equal(perfil.id, 'u42');
  assert.equal(perfil.email, 'x@onepay.co');
});

test('construirPerfil pasa idOrganizacion de la identidad tal cual', () => {
  const perfil = construirPerfil(
    { id: 'u1', email: 'a@b.com', owner: 'Ana Owner', admin: false, idOrganizacion: 3, soloLectura: false, verTodoPipeline: false },
    PREFERENCIAS_DEFAULT,
  );
  assert.equal(perfil.idOrganizacion, 3);
});

test('visitante (soloLectura) tiene rol Visitante y propaga soloLectura al perfil', () => {
  const perfil = construirPerfil(identidad({ soloLectura: true, admin: false }), PREFERENCIAS_DEFAULT);
  assert.equal(perfil.rol, 'Visitante');
  assert.equal(perfil.soloLectura, true);
});
