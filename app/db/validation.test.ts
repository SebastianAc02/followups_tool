import test from 'node:test';
import assert from 'node:assert/strict';
import {
  definicionSegmentoSchema,
  definicionSegmentoBorradorSchema,
  campanaInputSchema,
  RESULTADOS,
  RESULTADO_LABELS,
  RESULTADOS_CONTESTO,
  registrarToqueSchema,
} from './validation.ts';

// Los dos contratos, explicitos y probados juntos: el borrador (lo que el Copiloto puede
// proponer y la UI puede tener en pantalla) admite cero condiciones; el estricto (lo que
// se puede GUARDAR y EJECUTAR) no. Esa reja no es cosmetica: un segmento sin condiciones
// matchea la base entera, o sea una campana masiva a todo el mundo.
test('el schema estricto rechaza un segmento sin condiciones (reja de persistencia)', () => {
  const r = definicionSegmentoSchema.safeParse({ condiciones: [] });
  assert.equal(r.success, false, 'guardar/ejecutar un segmento vacio mandaria a la base entera');
});

test('el schema de borrador acepta un segmento sin condiciones (estado inicial del Copiloto)', () => {
  const r = definicionSegmentoBorradorSchema.safeParse({ condiciones: [] });
  assert.equal(r.success, true, 'vacio es el estado inicial legitimo, no un error');
});

test('el schema de borrador sigue rechazando un campo inventado', () => {
  const r = definicionSegmentoBorradorSchema.safeParse({ condiciones: [{ campo: 'inventado', op: 'en', valores: ['x'] }] });
  assert.equal(r.success, false, 'relajar min(1) no debe relajar la validacion de campos');
});

test('acepta operador mayor_que sobre campo numerico', () => {
  const r = definicionSegmentoSchema.safeParse({
    condiciones: [{ campo: 'usuarios', op: 'mayor_que', valor: 200000 }],
  });
  assert.equal(r.success, true);
});

test('rechaza mayor_que sobre campo no numerico', () => {
  const r = definicionSegmentoSchema.safeParse({
    condiciones: [{ campo: 'ciudad', op: 'mayor_que', valor: 5 }],
  });
  assert.equal(r.success, false);
});

test('acepta departamento y rol (string) y personas (numerico)', () => {
  const r = definicionSegmentoSchema.safeParse({
    condiciones: [
      { campo: 'departamento', op: 'en', valores: ['Valle del Cauca'] },
      { campo: 'rol', op: 'en', valores: ['gerente', 'dueno'] },
      { campo: 'personas', op: 'mayor_que', valor: 1 },
    ],
  });
  assert.equal(r.success, true);
});

test('campanaInputSchema default reglaFaltante = cola', () => {
  const r = campanaInputSchema.parse({ nombre: 'X', idCadencia: 1, idSegmento: 1 });
  assert.equal(r.reglaFaltante, 'cola');
});

test('campanaInputSchema rechaza regla desconocida', () => {
  const r = campanaInputSchema.safeParse({ nombre: 'X', idCadencia: 1, idSegmento: 1, reglaFaltante: 'inventada' });
  assert.equal(r.success, false);
});

test('campanaInputSchema acepta intakeDiario positivo y lo deja undefined si no viene', () => {
  const sinIntake = campanaInputSchema.parse({ nombre: 'X', idCadencia: 1, idSegmento: 1 });
  assert.equal(sinIntake.intakeDiario, undefined);
  const conIntake = campanaInputSchema.parse({ nombre: 'X', idCadencia: 1, idSegmento: 1, intakeDiario: 50 });
  assert.equal(conIntake.intakeDiario, 50);
});

test('definicionSegmento acepta es_null sobre owner', () => {
  const r = definicionSegmentoSchema.safeParse({
    condiciones: [{ campo: 'owner', op: 'es_null' }],
  });
  assert.equal(r.success, true);
});

test('definicionSegmento rechaza es_null sobre rol (1-a-muchos, sin semantica de columna)', () => {
  const r = definicionSegmentoSchema.safeParse({
    condiciones: [{ campo: 'rol', op: 'es_null' }],
  });
  assert.equal(r.success, false);
});

// id_empresa: el campo que le faltaba al segmento para apuntar a una lista puntual de
// empresas (campana ConmuTV 2026-08-25, ver crear_cadencia en server.ts).
test('definicionSegmento acepta id_empresa con en/no_en (lista puntual de empresas)', () => {
  const r = definicionSegmentoSchema.safeParse({
    condiciones: [{ campo: 'id_empresa', op: 'en', valores: ['e1', 'e2'] }],
  });
  assert.equal(r.success, true);
});

test('definicionSegmento rechaza es_null/no_null sobre id_empresa (PK NOT NULL, no informa nada)', () => {
  assert.equal(definicionSegmentoSchema.safeParse({ condiciones: [{ campo: 'id_empresa', op: 'es_null' }] }).success, false);
  assert.equal(definicionSegmentoSchema.safeParse({ condiciones: [{ campo: 'id_empresa', op: 'no_null' }] }).success, false);
});

test('definicionSegmento acepta orden y limite opcionales', () => {
  const r = definicionSegmentoSchema.safeParse({
    condiciones: [{ campo: 'categoria', op: 'en', valores: ['isp'] }],
    orden: { campo: 'usuarios', dir: 'desc' },
    limite: 50,
  });
  assert.equal(r.success, true);
});

test('rechaza orden sobre campo no numerico', () => {
  const r = definicionSegmentoSchema.safeParse({
    condiciones: [{ campo: 'categoria', op: 'en', valores: ['isp'] }],
    orden: { campo: 'ciudad', dir: 'desc' },
  });
  assert.equal(r.success, false);
});

test('no_llego es un resultado valido, con label, y no dispara busqueda de transcript', () => {
  assert.ok(RESULTADOS.includes('no_llego'));
  assert.equal(RESULTADO_LABELS.no_llego, 'No llegó a la reunión');
  assert.ok(!RESULTADOS_CONTESTO.includes('no_llego'));
});

test('registrarToqueSchema acepta no_llego sin exigir razonPerdida, pero SI la fecha que se incumplio', () => {
  const conFecha = registrarToqueSchema.safeParse({
    idEmpresa: 'e1',
    canal: 'reunion',
    resultado: 'no_llego',
    reunionFechaPropuesta: '2026-07-27',
  });
  assert.equal(conFecha.success, true, 'no_llego no pide razonPerdida');

  // Sin la fecha propuesta el no-show no se puede contar contra nada: se rechaza en vez de
  // guardar media fila.
  const sinFecha = registrarToqueSchema.safeParse({ idEmpresa: 'e1', canal: 'reunion', resultado: 'no_llego' });
  assert.equal(sinFecha.success, false);

  // Y no puede decir a la vez que la reunion no ocurrio y cuando ocurrio.
  const contradictorio = registrarToqueSchema.safeParse({
    idEmpresa: 'e1',
    canal: 'reunion',
    resultado: 'no_llego',
    reunionFechaPropuesta: '2026-07-27',
    reunionFechaOcurrida: '2026-07-27',
  });
  assert.equal(contradictorio.success, false);
});
