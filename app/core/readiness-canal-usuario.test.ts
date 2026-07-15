import test from 'node:test';
import assert from 'node:assert/strict';
import { readinessCanalUsuario } from './readiness-canal-usuario.ts';

test('correo bloquea si el usuario no tiene Gmail verificado', () => {
  const veredicto = readinessCanalUsuario('correo', true, false);
  assert.deepEqual(veredicto, {
    listo: false,
    motivo: 'Conecta tu Gmail en Conectores antes de lanzar una cadencia de correo (o pide que alguien con Gmail conectado la lance).',
    accion: 'ir_a_conectores',
  });
});

test('correo pasa si el usuario tiene Gmail verificado', () => {
  assert.deepEqual(readinessCanalUsuario('correo', false, true), { listo: true });
});

test('llamada nunca bloquea', () => {
  assert.deepEqual(readinessCanalUsuario('llamada', false, false), { listo: true });
});

test('whatsapp bloquea si el usuario no tiene linea activa propia', () => {
  const veredicto = readinessCanalUsuario('whatsapp', false, false);
  assert.deepEqual(veredicto, {
    listo: false,
    motivo: 'No tienes ninguna línea de WhatsApp conectada. Conecta una en Conectores antes de lanzar.',
    accion: 'ir_a_conectores',
  });
});

test('whatsapp pasa si el usuario tiene linea activa propia', () => {
  assert.deepEqual(readinessCanalUsuario('whatsapp', true, false), { listo: true });
});
