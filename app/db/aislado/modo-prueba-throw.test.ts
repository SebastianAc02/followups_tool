// El test del throw vive AISLADO y fuera del glob de `npm test` a proposito.
//
// Razon: necesita un proceso donde NADIE haya declarado el modo. El setup global
// (scripts/test-setup.ts, cargado con --import en `npm test`) marca modo real en cada
// proceso de la suite, y enterWith marca el contexto RAIZ -- una vez marcado, getStore()
// nunca vuelve a undefined. Correr esto con el setup lo haria pasar por la razon
// equivocada (leeria el false del setup en vez del undefined que quiere probar).
//
// Corre con `npm run test:aislado`, encadenado al final de `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../index.ts';
import { organizacion } from '../schema.ts';
import { esModoPrueba } from '../../lib/modo-prueba.ts';

test('esModoPrueba lanza si nadie declaro el modo', () => {
  assert.throws(() => esModoPrueba(), /sin modo declarado/i);
});

test('el Proxy del db lanza en vez de adivinar la base', () => {
  assert.throws(() => db.select().from(organizacion), /sin modo declarado/i);
});
