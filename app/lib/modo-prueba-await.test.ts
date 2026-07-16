// Reproduce la ESTRUCTURA REAL de una request de Next, que ningun test cubria:
// requireSession() es async, cruza un await (getSession) ANTES de resolver el modo, y el
// llamador (page / server action) la awaitea y DESPUES consulta la DB.
//
// Los tests que ya existian marcaban el modo de forma sincrona en el mismo contexto, asi
// que nunca vieron el bug: enterWith llamado despues de un await vive en un contexto hijo
// que muere al retornar, y el llamador se queda con el valor viejo (isps.db) aunque el
// banner diga MODO PRUEBA. Encontrado en vivo el 2026-07-15 probando la demo: el Copiloto
// listaba las categorias de la base REAL estando en modo prueba.
import test from 'node:test';
import assert from 'node:assert/strict';
import { marcarModoPrueba, reservarModo, esModoPrueba } from './modo-prueba.ts';

async function leerCookieFalsa(): Promise<boolean> {
  await new Promise((r) => setTimeout(r, 1));
  return true;
}

// Gemela de requireSession: reserva la caja ANTES del primer await (ahi todavia corre en
// el contexto del llamador), cruza awaits de verdad, y recien despues la llena.
async function requireSessionFalso(): Promise<{ owner: string }> {
  const caja = reservarModo();
  await new Promise((r) => setTimeout(r, 1)); // getSession
  caja.valor = await leerCookieFalsa();
  return { owner: 'Sebastian' };
}

test('el modo resuelto dentro de un requireSession awaiteado sobrevive en el llamador', async () => {
  marcarModoPrueba(false); // arranca en real, como una request nueva
  await requireSessionFalso();
  assert.equal(
    esModoPrueba(),
    true,
    'si esto falla, toda page/action lee isps.db aunque el banner diga MODO PRUEBA',
  );
});

test('sin reservar, el modo sigue siendo el del contexto (real por defecto)', async () => {
  marcarModoPrueba(false);
  assert.equal(esModoPrueba(), false);
});

// Aislamiento entre requests concurrentes: una en prueba y una normal no se pisan. Es la
// razon de ser del ALS (una variable de modulo las mezclaria).
test('dos requests concurrentes no se pisan el modo', async () => {
  async function request(modo: boolean, demora: number): Promise<boolean> {
    const caja = reservarModo();
    await new Promise((r) => setTimeout(r, demora));
    caja.valor = modo;
    await new Promise((r) => setTimeout(r, demora));
    return esModoPrueba();
  }
  const [enPrueba, enReal] = await Promise.all([request(true, 5), request(false, 2)]);
  assert.equal(enPrueba, true, 'la request en prueba debe verse en prueba');
  assert.equal(enReal, false, 'la request normal debe verse en real');
});
