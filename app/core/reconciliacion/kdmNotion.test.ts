// G (2026-07-15): la regla de Sebastian es la PROCEDENCIA, no el cargo. Un contacto que
// vino de Notion ya paso por trabajo humano: es una persona real con la que se habla,
// tipicamente quien decide. Marcar por cargo cubria 36 de 201 contactos (96 tienen
// cargo_categoria='desconocido' porque el CSV de Notion trae "Cargo Contacto" vacio muy
// seguido -- Jigartel/Nayris es ese caso exacto: cargo vacio, pero ES el contacto).
import test from 'node:test';
import assert from 'node:assert/strict';
import { esKdmDesdeNotion } from './kdmNotion.ts';

test('el Contacto Principal de Notion es el decisor, aunque el cargo venga vacio', () => {
  assert.equal(esKdmDesdeNotion({ esPrincipal: true, cargo: '' }), true);
  assert.equal(esKdmDesdeNotion({ esPrincipal: true, cargo: 'Desconocido' }), true);
});

test('el Contacto Principal es decisor cualquiera sea su cargo', () => {
  assert.equal(esKdmDesdeNotion({ esPrincipal: true, cargo: 'CEO / Dueño' }), true);
  assert.equal(esKdmDesdeNotion({ esPrincipal: true, cargo: 'Coordinador / Otro' }), true);
});

test('miembro del comite con cargo de decisor tambien cuenta', () => {
  assert.equal(esKdmDesdeNotion({ esPrincipal: false, cargo: 'CEO / Dueño' }), true);
  assert.equal(esKdmDesdeNotion({ esPrincipal: false, cargo: 'Gerente General' }), true);
  assert.equal(esKdmDesdeNotion({ esPrincipal: false, cargo: 'Representante Legal' }), true);
  assert.equal(esKdmDesdeNotion({ esPrincipal: false, cargo: 'Subgerente Comercial' }), true);
});

test('miembro del comite que NO decide no se marca', () => {
  assert.equal(esKdmDesdeNotion({ esPrincipal: false, cargo: 'Soporte Tecnico' }), false);
  assert.equal(esKdmDesdeNotion({ esPrincipal: false, cargo: 'Cartera' }), false);
  assert.equal(esKdmDesdeNotion({ esPrincipal: false, cargo: '' }), false);
});
