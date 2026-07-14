import test from 'node:test';
import assert from 'node:assert/strict';
import { readinessCanalUsuario } from './readiness-canal-usuario.ts';

test('correo siempre bloquea, sin importar si el usuario tiene linea de whatsapp', () => {
  const veredicto = readinessCanalUsuario('correo', true);
  assert.deepEqual(veredicto, {
    listo: false,
    motivo: 'El correo sale por una sola cuenta compartida de equipo. Habla con tu admin antes de lanzar una cadencia de correo.',
    accion: 'hablar_con_admin',
  });
});

test('llamada nunca bloquea', () => {
  assert.deepEqual(readinessCanalUsuario('llamada', false), { listo: true });
});

test('whatsapp bloquea si el usuario no tiene linea activa propia', () => {
  const veredicto = readinessCanalUsuario('whatsapp', false);
  assert.deepEqual(veredicto, {
    listo: false,
    motivo: 'No tienes ninguna línea de WhatsApp conectada. Conecta una en Conectores antes de lanzar.',
    accion: 'ir_a_conectores',
  });
});

test('whatsapp pasa si el usuario tiene linea activa propia', () => {
  assert.deepEqual(readinessCanalUsuario('whatsapp', true), { listo: true });
});
