// Verifica que ClaudeAdapter.generar cumple el contrato del puerto: o devuelve un
// valor que ya paso el schema, o lanza. Nunca un valor a medio validar.
//
// Lo que NO prueba este test (y no debe): que el gateway (dario) funcione, que la
// cuenta este activa, o que el modelo razone bien un prompt real de negocio — eso
// es la eval de evals.md con el dataset gold.
import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

// Variables de entorno minimas que necesita el adaptador para construir el cliente.
process.env.DARIO_URL = 'http://localhost:3456';
process.env.DARIO_KEY = 'dario';

const { crearClaudeAdapter } = await import('./claude.ts');

const schemaSaludo = z.object({ saludo: z.string() });

// El client falso solo necesita el metodo que usa el adaptador (messages.create).
// Cada llamada consume la siguiente respuesta de la lista (o repite la ultima).
function clienteFalso(respuestas: unknown[]) {
  let llamada = 0;
  return {
    messages: {
      create: async () => {
        const input = respuestas[Math.min(llamada, respuestas.length - 1)];
        llamada++;
        return { content: [{ type: 'tool_use', id: 'toolu_1', name: 'responder', input }] };
      },
    },
  } as unknown as import('@anthropic-ai/sdk').default;
}

test('generar devuelve el objeto validado cuando el tool_use cumple el schema', async () => {
  const adapter = crearClaudeAdapter(clienteFalso([{ saludo: 'hola' }]));
  const r = await adapter.generar('di hola', schemaSaludo);
  assert.deepEqual(r, { saludo: 'hola' });
});

test('generar reintenta una vez si la primera respuesta no cumple el schema', async () => {
  const adapter = crearClaudeAdapter(clienteFalso([{ saludo: 123 }, { saludo: 'hola' }]));
  const r = await adapter.generar('di hola', schemaSaludo);
  assert.deepEqual(r, { saludo: 'hola' });
});

test('generar lanza si tampoco el reintento cumple el schema', async () => {
  const adapter = crearClaudeAdapter(clienteFalso([{ saludo: 1 }, { saludo: 2 }]));
  await assert.rejects(() => adapter.generar('di hola', schemaSaludo));
});
