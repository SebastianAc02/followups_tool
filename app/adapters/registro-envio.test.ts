// crearRegistroEnvio() (que adaptador real por canal) y CANALES_AUTOMATICOS (lista
// estatica para validar sin construir adaptadores) se mantienen a mano por separado --
// nada del lenguaje los ata entre si. Esta prueba es la unica defensa contra que
// diverjan (alguien agrega un proveedor real y se olvida de sumar el canal a la lista,
// o al reves).
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearRegistroEnvio, CANALES_AUTOMATICOS } from './registro-envio.ts';
import { CANALES } from '../db/validation.ts';

test('crearRegistroEnvio() tiene un adaptador real exactamente para los canales de CANALES_AUTOMATICOS', () => {
  const registro = crearRegistroEnvio();
  const canalesConAdapter = CANALES.filter((c) => registro[c] !== null).sort();

  assert.deepEqual(canalesConAdapter, [...CANALES_AUTOMATICOS].sort());
});

test('todo canal fuera de CANALES_AUTOMATICOS no tiene adaptador (fuerza la via manual)', () => {
  const registro = crearRegistroEnvio();
  const sinProveedor = CANALES.filter((c) => !CANALES_AUTOMATICOS.includes(c));

  for (const canal of sinProveedor) {
    assert.equal(registro[canal], null, `${canal} deberia ser null (sin proveedor automatico)`);
  }
});
