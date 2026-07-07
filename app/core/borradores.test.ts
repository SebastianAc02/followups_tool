import test from 'node:test';
import assert from 'node:assert/strict';
import { pedirBorradores } from './borradores.ts';
import type { IAPort } from './ports/ia.ts';

test('pedirBorradores no llama a la IA cuando el resumen esta vacio', async () => {
  let llamado = false;
  const ia: IAPort = { generar: async () => { llamado = true; return {} as never; } };
  const r = await pedirBorradores('   ', ia);
  assert.equal(llamado, false);
  assert.deepEqual(r, { notasDiscovery: '', quePaso: '', brief: '', proximoPaso: '' });
});

test('pedirBorradores devuelve lo que entrega la IA cuando hay resumen', async () => {
  const esperado = {
    notasDiscovery: 'Asistio el gerente.',
    quePaso: 'Presentamos la demo.',
    brief: 'ISP en Medellin, 800 suscriptores.',
    proximoPaso: 'Enviar propuesta el viernes.',
  };
  const ia: IAPort = { generar: async <T,>() => esperado as T };
  const r = await pedirBorradores('reunion con Carlos, gerente de Fibernet...', ia);
  assert.deepEqual(r, esperado);
});
