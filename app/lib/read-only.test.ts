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

// Task 3 (plan 2026-07-15-embudo-real-y-registro, causa raiz 4): los tests de arriba son
// 100% sincronicos, no prueban lo unico que importa de verdad -- que el candado sobreviva
// a un await real y que dos requests concurrentes no se pisen. Reproducido a mano fuera
// del repo (script standalone con AsyncLocalStorage + http.createServer real, 3 variantes
// crecientes de realismo) ANTES de escribir esto: en los tres casos enterWith aislo
// correctamente cada request, incluyendo el escenario mas realista (servidor http real
// con dos requests concurrentes). No se pudo reproducir la fuga al contexto raiz ni la
// perdida tras el await que describe la causa raiz 4 -- sigue siendo hipotesis, no bug
// confirmado. Estos tests SI cruzan await y SI corren dos "requests" concurrentes: son
// el regression test que faltaba, y hoy pasan con la implementacion actual (enterWith).
// Si algun dia fallan, ESO es la señal real de que hay que migrar a run().
test('marcarSoloLectura sobrevive a un await real, no solo a lectura sincronica', async () => {
  marcarSoloLectura(true);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(esSoloLectura(), true, 'el candado debe seguir puesto despues de un await');
  marcarSoloLectura(false);
});

test('dos "requests" concurrentes (visitante y normal) no se pisan ni se filtran', async () => {
  async function simularRequest(soloLectura: boolean, delayMs: number) {
    marcarSoloLectura(soloLectura);
    await new Promise((r) => setTimeout(r, delayMs));
    // La escritura real (a traves del Proxy del db) es el criterio que de verdad importa,
    // no solo esSoloLectura(): es lo que un visitante NO debe poder colar.
    if (soloLectura) {
      assert.throws(() => db.insert(organizacion), ErrorSoloLectura, 'un visitante no debe poder escribir tras el await de otra request');
    } else {
      assert.doesNotThrow(() => db.insert(organizacion), 'una request normal no debe heredar el candado de la visitante');
    }
    return esSoloLectura();
  }

  // Delays cruzados a proposito: la visitante (mas lenta) resuelve DESPUES que la
  // request normal arranco y ya cambio el candado -- si hubiera fuga entre contextos,
  // esto es lo que la mostraria.
  const [visitante, normal] = await Promise.all([
    simularRequest(true, 20),
    simularRequest(false, 5),
  ]);

  assert.equal(visitante, true);
  assert.equal(normal, false);
  marcarSoloLectura(false);
});
