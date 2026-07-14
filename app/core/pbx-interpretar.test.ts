import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretarResultadoPBX } from './pbx-interpretar.ts';
import { IAFake } from '../adapters/ia-fake.ts';
import type { IAPort } from './ports/ia.ts';

test('interpretarResultadoPBX devuelve el resultado validado por el schema', async () => {
  const esperado = {
    clase: 'referido_persona' as const,
    personaReferida: 'Andrea de compras',
    kdmNombre: null,
    kdmTelefono: null,
    kdmEmail: null,
    proximoPasoTexto: 'Hablar con Andrea de compras',
  };
  const r = await interpretarResultadoPBX(new IAFake(esperado), 'la recepcionista me dijo que hable con Andrea de compras');
  assert.deepEqual(r, esperado);
});

test('interpretarResultadoPBX incluye el que paso en el prompt enviado a la IA', async () => {
  let promptRecibido = '';
  const ia: IAPort = {
    generar: async (prompt) => {
      promptRecibido = prompt;
      return {
        clase: 'sin_respuesta',
        personaReferida: null,
        kdmNombre: null,
        kdmTelefono: null,
        kdmEmail: null,
        proximoPasoTexto: 'Reintentar llamada',
      } as never;
    },
  };
  await interpretarResultadoPBX(ia, 'llame tres veces y nadie contesto');
  assert.match(promptRecibido, /llame tres veces y nadie contesto/);
});
