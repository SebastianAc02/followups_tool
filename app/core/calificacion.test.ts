import test from 'node:test';
import assert from 'node:assert/strict';
import { calificar, CAMPOS_CALIFICACION } from './calificacion.ts';

test('calificar marca presente el campo con valor y ausente el vacio', () => {
  const r = calificar({ usuarios: 1240, crm: 'Zoho', pasarela: null });
  const porNombre = Object.fromEntries(r.items.map((i) => [i.campo, i]));
  assert.equal(porNombre.usuarios.estado, 'tengo');
  assert.equal(porNombre.usuarios.valor, '1,240'); // coma fija: calca el mockup del Toque 1/Confirmacion
  assert.equal(porNombre.crm.estado, 'tengo');
  assert.equal(porNombre.pasarela.estado, 'preguntar');
});

test('calificar cuenta cuantos tengo sobre el total de imprescindibles', () => {
  const r = calificar({ usuarios: 10, crm: 'X', pasarela: 'Y' });
  assert.equal(r.tengo, 3);
  assert.equal(r.total, CAMPOS_CALIFICACION.length);
});

test('calificar trata el string vacio como ausente', () => {
  const r = calificar({ usuarios: null, crm: '', pasarela: null });
  assert.equal(r.tengo, 0);
});

// El recaudo era un item zombi: sin columna en empresa, llegaba hardcodeado en null desde
// page.tsx y siempre decia PREGUNTAR sin que nadie pudiera llenarlo. Es un fact que vive dentro
// de notas_discovery, no un hermano de estos tres (que si tienen columna propia en empresa).
test('recaudo no es un campo de calificacion: vive en notas_discovery', () => {
  const campos = CAMPOS_CALIFICACION.map((c) => c.campo);
  assert.deepEqual(campos, ['usuarios', 'pasarela', 'crm']);
});
