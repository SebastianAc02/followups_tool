import test from 'node:test';
import assert from 'node:assert/strict';
import { pedirBorradores } from './borradores.ts';
import type { ToqueEstructurado } from './estructurar-toque.ts';
import type { IAPort } from './ports/ia.ts';

test('pedirBorradores no llama a la IA cuando el resumen esta vacio', async () => {
  let llamado = false;
  const ia: IAPort = { generar: async () => { llamado = true; return {} as never; } };
  const r = await pedirBorradores('   ', ia);
  assert.equal(llamado, false);
  assert.equal(r.quePaso, '');
  assert.equal(r.notasDiscovery, '');
  assert.equal(r.brief, '');
  assert.equal(r.resultado, null);
});

test('pedirBorradores devuelve lo que entrega la IA cuando hay resumen', async () => {
  const esperado: ToqueEstructurado = {
    resultado: null,
    quePaso: 'Presentamos la demo. Quedan de decidir.',
    resumen: 'Reunion de 40 minutos con Carlos. Levantamos la operacion y mostramos el flujo.',
    brief: 'ISP en Medellin, 800 suscriptores. Dolor: cartera manual.',
    notasDiscovery: '800 suscriptores. CRM Wispro. Pasarela PayU.',
    usuarios: 800,
    crm: 'Wispro',
    pasarela: 'PayU',
    proximoPaso: 'Enviar propuesta el viernes.',
    proximoFollowUp: '2026-07-17',
  };
  const ia: IAPort = { generar: async <T,>() => esperado as T };
  const r = await pedirBorradores('reunion con Carlos, gerente de Fibernet...', ia);
  assert.deepEqual(r, esperado);
});

// Los dos caminos (Granola y el dictado) tienen que producir la MISMA forma: si divergen, la UI
// que pinta el borrador y la action que lo guarda tendrian que ramificar por origen, que es
// justo lo que se elimino el 2026-07-15.
test('pedirBorradores y estructurarToque comparten el tipo del borrador', async () => {
  const ia: IAPort = { generar: async <T,>() => ({ quePaso: 'x' } as T) };
  const r = await pedirBorradores('algo', ia);
  const tipado: ToqueEstructurado['quePaso'] = r.quePaso;
  assert.equal(tipado, 'x');
});

test('el borrador de Granola no tiene recaudo: es un fact dentro de notasDiscovery', async () => {
  const r = await pedirBorradores('   ', { generar: async () => ({}) as never });
  assert.ok(!('recaudo' in r));
});
