import test from 'node:test';
import assert from 'node:assert/strict';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';
import { dbDePrueba } from './organizacion-repository.ts';
import { leerPreferencia, guardarPreferencia } from './preferencias-repository.ts';

let dbPath: string;

test.beforeEach(() => {
  dbPath = crearDbPrueba();
});

test.afterEach(() => {
  borrarDbPrueba(dbPath);
});

test('leerPreferencia devuelve undefined cuando no hay fila', () => {
  const db = dbDePrueba(dbPath);
  const fila = leerPreferencia('user-sin-fila', db);
  assert.equal(fila, undefined);
});

test('guardarPreferencia crea la fila y leerPreferencia la devuelve', () => {
  const db = dbDePrueba(dbPath);
  guardarPreferencia('user-1', { colorAvatar: 'verde' }, db);

  const fila = leerPreferencia('user-1', db);
  assert.equal(fila?.colorAvatar, 'verde');
  assert.equal(fila?.vistaInicio, null, 'campo no enviado queda NULL, no un default inventado aca');
});

test('guardarPreferencia con cambio parcial no borra un campo ya guardado', () => {
  const db = dbDePrueba(dbPath);
  guardarPreferencia('user-1', { colorAvatar: 'verde', vistaInicio: '/cola' }, db);
  guardarPreferencia('user-1', { colorAvatar: 'rosa' }, db);

  const fila = leerPreferencia('user-1', db);
  assert.equal(fila?.colorAvatar, 'rosa');
  assert.equal(fila?.vistaInicio, '/cola', 'vistaInicio no se toco en el segundo guardado, debe seguir igual');
});
