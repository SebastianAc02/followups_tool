import test from 'node:test';
import assert from 'node:assert/strict';
import { fusionarDiscovery, hidratarBrief } from './fusionar.ts';
import type { IAPort } from './ports/ia.ts';

test('fusionarDiscovery no llama a la IA cuando no hay facts nuevos', async () => {
  let llamado = false;
  const ia: IAPort = { generar: async () => { llamado = true; return {} as never; } };
  const r = await fusionarDiscovery('10.000 usuarios. CRM Wispro.', '   ', ia);
  assert.equal(llamado, false);
  assert.equal(r, '10.000 usuarios. CRM Wispro.');
});

test('fusionarDiscovery devuelve los facts nuevos tal cual cuando no habia notas', async () => {
  let llamado = false;
  const ia: IAPort = { generar: async () => { llamado = true; return {} as never; } };
  const r = await fusionarDiscovery('', 'Pasarela Epayco. 8 personas en recaudo.', ia);
  assert.equal(llamado, false);
  assert.equal(r, 'Pasarela Epayco. 8 personas en recaudo.');
});

test('fusionarDiscovery le pasa a la IA las notas actuales y los facts nuevos', async () => {
  let promptVisto = '';
  const ia: IAPort = {
    generar: async <T,>(prompt: string) => {
      promptVisto = prompt;
      return { notas: '10.000 usuarios. CRM Wispro. Pasarela Epayco.' } as T;
    },
  };
  await fusionarDiscovery('10.000 usuarios. CRM Wispro.', 'Pasarela Epayco.', ia);
  assert.match(promptVisto, /10\.000 usuarios/);
  assert.match(promptVisto, /Pasarela Epayco/);
});

test('fusionarDiscovery devuelve la fusion que entrega la IA', async () => {
  const ia: IAPort = { generar: async <T,>() => ({ notas: '10.000 usuarios. Pasarela Epayco.' } as T) };
  const r = await fusionarDiscovery('10.000 usuarios.', 'Pasarela Epayco.', ia);
  assert.equal(r, '10.000 usuarios. Pasarela Epayco.');
});

// El test que de verdad importa: la fusion no puede destruir lo que costo llamadas.
test('fusionarDiscovery rechaza una fusion que perdio contenido y devuelve las notas actuales', async () => {
  const notasActuales =
    '10.000 usuarios. Pasarela Epayco, con caidas en dias de pago. 8 personas validan pagos. CRM Wispro.';
  const ia: IAPort = { generar: async <T,>() => ({ notas: 'Pasarela Epayco.' } as T) };
  const r = await fusionarDiscovery(notasActuales, 'Pasarela Epayco.', ia);
  assert.equal(r, notasActuales, 'una fusion sospechosamente corta no puede pisar las notas buenas');
});

test('hidratarBrief no llama a la IA cuando el toque nuevo viene vacio', async () => {
  let llamado = false;
  const ia: IAPort = { generar: async () => { llamado = true; return {} as never; } };
  const r = await hidratarBrief('Cuenta de Andina Link.', '  ', ia);
  assert.equal(llamado, false);
  assert.equal(r, 'Cuenta de Andina Link.');
});

test('hidratarBrief arranca el brief cuando no habia', async () => {
  const ia: IAPort = { generar: async <T,>() => ({ brief: 'Cuenta que llamamos el 19-jun.' } as T) };
  const r = await hidratarBrief('', 'Llamamos a Cesar, no hay fit.', ia);
  assert.equal(r, 'Cuenta que llamamos el 19-jun.');
});

test('hidratarBrief le pasa a la IA el brief actual y el toque nuevo', async () => {
  let promptVisto = '';
  const ia: IAPort = {
    generar: async <T,>(prompt: string) => {
      promptVisto = prompt;
      return { brief: 'x' } as T;
    },
  };
  await hidratarBrief('Cuenta de Andina Link.', 'Llamamos a Cesar, no hay fit.', ia);
  assert.match(promptVisto, /Andina Link/);
  assert.match(promptVisto, /Cesar/);
});

test('hidratarBrief rechaza una hidratacion que perdio contenido', async () => {
  const briefActual =
    'Cuenta que conocimos en Andina Link. Se llamo el 19-jun. Nos dijo que no maneja cartera y ya usa Wompi mas PayU. Objeto el modelo de cobro.';
  const ia: IAPort = { generar: async <T,>() => ({ brief: 'No hay fit.' } as T) };
  const r = await hidratarBrief(briefActual, 'Llamamos otra vez.', ia);
  assert.equal(r, briefActual);
});
