// Candado solo-lectura (modo visitante). La parte critica de seguridad: que NINGUNA
// escritura a la DB se le escape al candado cuando la request es de un visitante.
import test from 'node:test';
import assert from 'node:assert/strict';
import { marcarSoloLectura, esSoloLectura, conEscritura, ErrorSoloLectura } from './read-only.ts';
import { db } from '../db/index.ts';
import { organizacion } from '../db/schema.ts';

test('esSoloLectura refleja la marca de la request', () => {
  marcarSoloLectura(true);
  assert.equal(esSoloLectura(), true);
  marcarSoloLectura(false);
  assert.equal(esSoloLectura(), false);
});

test('el Proxy del db bloquea insert/update/delete/transaction en solo-lectura', () => {
  marcarSoloLectura(true);
  assert.throws(() => db.insert(organizacion), ErrorSoloLectura);
  assert.throws(() => db.update(organizacion), ErrorSoloLectura);
  assert.throws(() => db.delete(organizacion), ErrorSoloLectura);
  assert.throws(() => db.transaction(() => undefined), ErrorSoloLectura);
  marcarSoloLectura(false);
});

test('el db deja pasar escrituras cuando NO es solo-lectura', () => {
  marcarSoloLectura(false);
  // db.insert(...) sin ejecutar: si el candado no bloquea, devuelve el query builder
  // sin lanzar ErrorSoloLectura (puede fallar despues por tabla, pero no por el candado).
  assert.doesNotThrow(() => db.insert(organizacion));
});

test('conEscritura levanta el candado solo dentro de su callback', () => {
  marcarSoloLectura(true);
  // Dentro: no lanza ErrorSoloLectura (la excepcion de WhatsApp de prueba usa esto).
  assert.doesNotThrow(() => conEscritura(() => db.insert(organizacion)));
  // Fuera del callback el candado sigue puesto.
  assert.throws(() => db.insert(organizacion), ErrorSoloLectura);
  marcarSoloLectura(false);
});
