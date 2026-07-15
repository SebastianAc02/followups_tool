import test from 'node:test';
import assert from 'node:assert/strict';
import { estructurarToque, toqueEstructuradoSchema } from './estructurar-toque.ts';
import { IAFake } from '../adapters/ia-fake.ts';

test('estructurarToque no llama a la IA si el dictado esta vacio', async () => {
  let llamado = false;
  const ia = { generar: async () => { llamado = true; return {} as never; } };
  const r = await estructurarToque('   ', ia);
  assert.equal(llamado, false);
  assert.equal(r.resumen, '');
  assert.equal(r.resultado, null);
});

test('estructurarToque devuelve campos validados por el schema', async () => {
  const esperado = {
    resultado: 'contesto_reunion', quePaso: 'Cerramos reunión jueves 4pm',
    resumen: 'Carla confirmó interés, dolor soporte Niubiz.',
    brief: 'ISP mediano en Lima, dolor de soporte con Niubiz.',
    notasDiscovery: '1240 usuarios. Pasarela Niubiz. Recaudo manual con Excel.',
    usuarios: 1240, crm: null, pasarela: 'Niubiz',
    proximoPaso: 'Enviar propuesta', proximoFollowUp: '2026-07-10',
  };
  const r = await estructurarToque('me dijo que...', new IAFake(esperado));
  assert.equal(r.resultado, 'contesto_reunion');
  assert.equal(r.usuarios, 1240);
});

// El recaudo se dicta y sale, pero adentro de los facts: no es un campo hermano de
// usuarios/crm/pasarela (esos tres tienen columna propia en empresa, el recaudo no).
test('el schema del borrador no tiene recaudo', () => {
  const r = toqueEstructuradoSchema.parse({
    resultado: null, quePaso: '', resumen: '', brief: '', notasDiscovery: '',
    usuarios: null, crm: null, pasarela: null, proximoPaso: '', proximoFollowUp: null,
  });
  assert.ok(!('recaudo' in r));
});
