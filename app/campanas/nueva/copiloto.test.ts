import test from 'node:test';
import assert from 'node:assert/strict';
import { pedirAlCopiloto } from './copiloto.ts';
import { IAFake } from '../../adapters/ia-fake.ts';

const estadoVacio = { condiciones: [{ campo: 'categoria' as const, op: 'en' as const, valores: ['isp'] }] };

test('pedirAlCopiloto devuelve el estado validado cuando la IA responde bien', async () => {
  const ia = new IAFake({
    estadoNuevo: {
      condiciones: [
        { campo: 'categoria', op: 'en', valores: ['isp'] },
        { campo: 'usuarios', op: 'mayor_que', valor: 200000 },
      ],
      orden: { campo: 'usuarios', dir: 'desc' },
      limite: 50,
    },
    explicacion: 'ISP, mas de 200k usuarios, las 50 mas grandes',
    noMapeado: [],
  });
  const r = await pedirAlCopiloto({ frase: 'tráeme las 50 ISP mas grandes de mas de 200k', estadoActual: estadoVacio }, ia);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.estado.limite, 50);
    assert.equal(r.explicacion.length > 0, true);
  }
});

test('pedirAlCopiloto rechaza un estado invalido de la IA (campo inventado)', async () => {
  const ia = new IAFake({
    estadoNuevo: { condiciones: [{ campo: 'inventado', op: 'en', valores: ['x'] }] },
    explicacion: '',
    noMapeado: [],
  });
  const r = await pedirAlCopiloto({ frase: 'lo que sea', estadoActual: estadoVacio }, ia);
  assert.equal(r.ok, false);
});
