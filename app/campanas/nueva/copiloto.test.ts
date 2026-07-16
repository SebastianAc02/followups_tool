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

// Bug real (2026-07-15, encontrado probando la demo): escribir "test" (o cualquier frase
// que no sea un criterio de segmentacion) devolvia "El Copiloto propuso un segmento
// invalido. Ajustalo a mano." SIEMPRE, no a veces. La IA hacia lo correcto -- devolver
// cero condiciones y listar la frase en noMapeado -- y el schema la rechazaba, porque
// accionCopilotoSchema validaba contra definicionSegmentoSchema, que exige min(1)
// condicion. Ese min(1) es la reja de PERSISTENCIA (un segmento sin condiciones matchea
// la base entera = campana masiva a todo el mundo), no un contrato de la conversacion:
// vacio es el estado inicial legitimo (NuevoSegmento.tsx lo llama VACIO) y la respuesta
// correcta a una instruccion que no mapea. El Copiloto valida contra el schema de
// BORRADOR; la reja sigue viva donde importa (ver validation.test.ts).
test('pedirAlCopiloto acepta cero condiciones cuando la frase no mapea a nada', async () => {
  const ia = new IAFake({
    estadoNuevo: { condiciones: [] },
    explicacion: 'La instruccion no contiene ninguna condicion de filtrado reconocible.',
    noMapeado: ['test'],
  });
  const r = await pedirAlCopiloto({ frase: 'test', estadoActual: { condiciones: [] } }, ia);
  assert.equal(r.ok, true, 'una frase sin criterio no es un error: es noMapeado');
  if (r.ok) {
    assert.deepEqual(r.estado.condiciones, []);
    assert.deepEqual(r.noMapeado, ['test']);
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

// F (2026-07-15): el motor solo soporta AND entre condiciones. Al pedir "Sebastian en
// owner O sin owner", el Copiloto descartaba la condicion de owner ENTERA y devolvia un
// segmento con las otras dos -- Sebastian recibio cuentas de Thomas (CELSIA) creyendo
// que habia filtrado por owner. Degradar en silencio es peor que no responder: el
// resultado se ve plausible y nadie revisa. Ahora el prompt obliga a preguntar.
test('el prompt prohibe descartar una condicion en silencio y exige preguntar', () => {
  const prompt = construirPrompt(
    { frase: 'top 20 isps on hold que sebastian en owner o no tiene owner', estadoActual: { condiciones: [] } },
    [{ campo: 'owner', ejemplosValor: ['Sebastian Acosta Molina', 'Thomas Schumacher'] }],
  );

  assert.match(prompt, /OR|\bo\b/i, 'el prompt habla del caso OR');
  assert.match(prompt, /pregunta/i, 'el prompt manda preguntar');
});
