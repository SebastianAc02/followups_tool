// Que se aplica solo y que se reporta. Lo que estos tests protegen es la frontera: en el momento
// en que "pagina sin cuenta" se vuelva automatico, la tool empieza a crear duplicados sola, que es
// el dano que costo la sesion del 2026-07-25.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planReconciliacion, normalizarPageId } from './planReconciliacion.ts';

const cuenta = (over: Partial<Parameters<typeof planReconciliacion>[1][0]> = {}) => ({
  idEmpresa: 'e1',
  nombre: 'EMPRESA UNO S.A.S',
  estado: 'lead',
  owner: 'Felipe Castro',
  notionPageId: 'aaaa1111bbbb2222cccc3333dddd4444',
  ...over,
});

test('misma pagina y todo igual: no se toca', () => {
  const p = planReconciliacion(
    [{ pageId: 'aaaa1111bbbb2222cccc3333dddd4444', estado: 'lead', owner: 'Felipe Castro' }],
    [cuenta()],
  );
  assert.equal(p.sinCambios, 1);
  assert.equal(p.alinear.length, 0);
});

test('misma pagina y distinto estado: se alinea a Notion', () => {
  const p = planReconciliacion(
    [{ pageId: 'aaaa1111bbbb2222cccc3333dddd4444', estado: 'oportunidad', owner: 'Felipe Castro' }],
    [cuenta()],
  );
  assert.equal(p.alinear.length, 1);
  assert.equal(p.alinear[0].estadoDe, 'lead');
  assert.equal(p.alinear[0].estadoA, 'oportunidad');
  assert.equal(p.alinear[0].ownerA, null, 'el owner coincide, no se toca');
});

test('misma pagina y distinto owner: se alinea a Notion', () => {
  const p = planReconciliacion(
    [{ pageId: 'aaaa1111bbbb2222cccc3333dddd4444', estado: 'lead', owner: 'Thomas Schumacher' }],
    [cuenta()],
  );
  assert.equal(p.alinear[0].ownerDe, 'Felipe Castro');
  assert.equal(p.alinear[0].ownerA, 'Thomas Schumacher');
  assert.equal(p.alinear[0].estadoA, null);
});

// Sin esto, cada pagina que alguien crea en Notion sin asignar owner borraria el owner de la
// base. Crear la pagina y asignarla despues es el flujo normal, asi que pasaria seguido.
test('owner vacio en Notion NO borra el de la base', () => {
  for (const owner of [null, undefined, '', '   ']) {
    const p = planReconciliacion(
      [{ pageId: 'aaaa1111bbbb2222cccc3333dddd4444', estado: 'lead', owner }],
      [cuenta()],
    );
    assert.equal(p.sinCambios, 1, `owner ${JSON.stringify(owner)} no deberia producir cambio`);
  }
});

// LA frontera. Si esto deja de reportarse y pasa a alinear, la tool crea cuentas sola.
test('pagina sin cuenta se REPORTA, nunca se crea', () => {
  const p = planReconciliacion([{ pageId: 'ffff9999ffff9999ffff9999ffff9999', estado: 'lead' }], [cuenta()]);
  assert.equal(p.paginasSinCuenta.length, 1);
  assert.equal(p.alinear.length, 0);
});

test('cuenta enlazada cuya pagina no vino se REPORTA, nunca se borra', () => {
  const p = planReconciliacion([], [cuenta()]);
  assert.deepEqual(p.cuentasSinPagina.map((c) => c.idEmpresa), ['e1']);
});

test('una cuenta sin page_id no cuenta como cuenta sin pagina: nunca estuvo enlazada', () => {
  const p = planReconciliacion([], [cuenta({ notionPageId: null })]);
  assert.equal(p.cuentasSinPagina.length, 0);
});

// Los page id llegan con guiones desde la API y sin guiones desde la URL. Sin normalizar, la
// misma pagina se ve como dos y se reportaria como "sin cuenta" teniendo cuenta.
test('el page id cruza igual con guiones que sin guiones', () => {
  const p = planReconciliacion(
    [{ pageId: 'AAAA1111-BBBB-2222-CCCC-3333DDDD4444', estado: 'lead', owner: 'Felipe Castro' }],
    [cuenta()],
  );
  assert.equal(p.sinCambios, 1);
  assert.equal(p.paginasSinCuenta.length, 0);
});

test('normalizarPageId deja solo los hex en minuscula', () => {
  assert.equal(normalizarPageId('AAAA1111-BBBB-2222'), 'aaaa1111bbbb2222');
});

test('un lote mezclado clasifica cada caso donde va', () => {
  const p = planReconciliacion(
    [
      { pageId: 'aaaa1111bbbb2222cccc3333dddd4444', estado: 'oportunidad', owner: 'Felipe Castro' },
      { pageId: 'bbbb2222cccc3333dddd4444eeee5555', estado: 'lead', owner: 'Felipe Castro' },
      { pageId: 'ffff9999ffff9999ffff9999ffff9999', estado: 'lead' },
    ],
    [cuenta(), cuenta({ idEmpresa: 'e2', notionPageId: 'bbbb2222cccc3333dddd4444eeee5555' }), cuenta({ idEmpresa: 'e3', notionPageId: 'cccc3333cccc3333cccc3333cccc3333' })],
  );
  assert.equal(p.alinear.length, 1, 'e1 cambia de etapa');
  assert.equal(p.sinCambios, 1, 'e2 esta igual');
  assert.equal(p.paginasSinCuenta.length, 1, 'la pagina ffff no tiene cuenta');
  assert.deepEqual(p.cuentasSinPagina.map((c) => c.idEmpresa), ['e3'], 'e3 esta enlazada y su pagina no vino');
});
