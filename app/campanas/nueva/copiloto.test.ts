import test from 'node:test';
import assert from 'node:assert/strict';
import { pedirAlCopiloto, construirPrompt } from './copiloto.ts';
import { IAFake } from '../../adapters/ia-fake.ts';

const estadoVacio = { condiciones: [{ campo: 'categoria' as const, op: 'en' as const, valores: ['isp'] }] };

// Bug real (2026-07-14): "las 50 ISPs mas grandes que no tienen owner" no se armaba.
// CAMPOS DISPONIBLES para owner solo trae valores NO nulos (valoresDistintosCampo filtra
// isNotNull), asi que sin una regla explicita el modelo nunca ve una senal de "ausencia"
// y termina inventando un no_en con la lista de owners conocidos -- que en SQL NO trae las
// filas con owner NULL (semantica de NOT IN), o lo bota a noMapeado. Este test no llama al
// modelo real (ver nota en pedirAlCopiloto sobre IAFake); protege que la regla exista en el
// prompt, que es la unica palanca que tenemos para guiar la interpretacion.
test('construirPrompt incluye una regla explicita para ausencia (es_null), no solo el schema', () => {
  const prompt = construirPrompt({ frase: 'las 50 ISPs mas grandes sin owner', estadoActual: estadoVacio }, [
    { campo: 'owner', ejemplosValor: ['Sebastian', 'Camila'] },
  ]);
  assert.match(prompt, /es_null/);
  assert.match(prompt, /sin|ausencia|no tiene/i);
});

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
