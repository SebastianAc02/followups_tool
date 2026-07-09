// V4.3: pruebas de segmentos. DB de archivo temporal seeded, nunca isps.db real (la
// verificacion contra el conteo real de on_hold va aparte, contra una COPIA, en el
// check en vivo de la tarea, no aca).

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const {
  empresasDeSegmento,
  contarSegmento,
  guardarSegmento,
  empresasDeSegmentoGuardado,
  listarSegmentos,
  valoresDistintosCampo,
  empresasParaRevision,
  muestraDestinatarioDeSegmento,
  excluirDeSegmento,
  incluirDeSegmento,
  obtenerSegmento,
  actualizarSegmento,
} = await import('./repository.ts');

function seed() {
  const raw = new Database(dbPath);
  const ins = raw.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, categoria, prioridad_comercial, es_cliente)
     VALUES (?, 'nit', ?, ?, 'activo', ?, ?, ?, ?)`,
  );
  // 3 on_hold isp, 1 on_hold utility, 2 oportunidad isp, 1 sin estado
  ins.run('e1', 'Alfa', 'alfa', 'on_hold', 'isp', 1, 0);
  ins.run('e2', 'Beta', 'beta', 'on_hold', 'isp', 5, 0);
  ins.run('e3', 'Gamma', 'gamma', 'on_hold', 'isp', 5, 1);
  ins.run('e4', 'Delta', 'delta', 'on_hold', 'utility', 3, 0);
  ins.run('e5', 'Epsilon', 'epsilon', 'oportunidad', 'isp', 9, 0);
  ins.run('e6', 'Zeta', 'zeta', 'oportunidad', 'isp', 4, 0);
  ins.run('e7', 'Eta', 'eta', null, 'isp', null, 0);
  raw.close();
}
seed();

test('segmento on_hold devuelve exactamente las 4 empresas on_hold (conteo a mano)', () => {
  const def = { condiciones: [{ campo: 'estado' as const, op: 'en' as const, valores: ['on_hold'] }] };
  const empresas = empresasDeSegmento(def, 1);
  assert.deepEqual(empresas.map((e) => e.id).sort(), ['e1', 'e2', 'e3', 'e4']);
  assert.equal(contarSegmento(def, 1), 4);
});

test('condiciones se ANDean: on_hold + isp excluye la utility', () => {
  const def = {
    condiciones: [
      { campo: 'estado' as const, op: 'en' as const, valores: ['on_hold'] },
      { campo: 'categoria' as const, op: 'en' as const, valores: ['isp'] },
    ],
  };
  assert.deepEqual(empresasDeSegmento(def, 1).map((e) => e.id).sort(), ['e1', 'e2', 'e3']);
});

test('campo numerico (prioridad) coerce string->numero y compara bien', () => {
  const def = { condiciones: [{ campo: 'prioridad' as const, op: 'en' as const, valores: ['5'] }] };
  assert.deepEqual(empresasDeSegmento(def, 1).map((e) => e.id).sort(), ['e2', 'e3']);
});

test('operador es_null encuentra la empresa sin estado', () => {
  const def = { condiciones: [{ campo: 'estado' as const, op: 'es_null' as const }] };
  assert.deepEqual(empresasDeSegmento(def, 1).map((e) => e.id), ['e7']);
});

test('no_en excluye valores', () => {
  const def = { condiciones: [{ campo: 'categoria' as const, op: 'no_en' as const, valores: ['utility'] }] };
  // todas menos la utility (e4)
  assert.deepEqual(empresasDeSegmento(def, 1).map((e) => e.id).sort(), ['e1', 'e2', 'e3', 'e5', 'e6', 'e7']);
});

test('guardar y correr el segmento guardado da el mismo resultado', () => {
  const id = guardarSegmento({
    nombre: 'on-hold',
    definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] },
    descripcionNatural: 'los que estan en on-hold',
  }, 1);
  const empresas = empresasDeSegmentoGuardado(id, 1);
  assert.ok(empresas);
  assert.deepEqual(empresas!.map((e) => e.id).sort(), ['e1', 'e2', 'e3', 'e4']);

  const listado = listarSegmentos();
  assert.ok(listado.find((s) => s.nombre === 'on-hold'));
});

test('empresasDeSegmentoGuardado de un id inexistente devuelve null', () => {
  assert.equal(empresasDeSegmentoGuardado(99999, 1), null);
});

test('un campo fuera de la whitelist es rechazado por validacion (no SQL libre)', () => {
  assert.throws(
    () => empresasDeSegmento({ condiciones: [{ campo: 'nombre_oficial', op: 'en', valores: ['x'] }] } as any, 1),
    /invalid|enum|nombre_oficial/i,
  );
});

test('un segmento sin condiciones es rechazado', () => {
  assert.throws(() => empresasDeSegmento({ condiciones: [] } as any, 1), /al menos una condicion/);
});

test('valor no numerico en un campo numerico (prioridad) falla explicito, no en silencio', () => {
  assert.throws(
    () => empresasDeSegmento({ condiciones: [{ campo: 'prioridad', op: 'en', valores: ['alta'] }] }, 1),
    /numerico/,
  );
});

// Parte 1 campanas: seed de usuarios para probar el operador entre.
// e1=12000, e2=5000, e3=800; e4..e7 SIN fila (sin dato de usuarios).
function seedUsuarios() {
  const raw = new Database(dbPath);
  const ins = raw.prepare('INSERT INTO empresa_usuarios (id_empresa, usuarios_estimados) VALUES (?, ?)');
  ins.run('e1', 12000);
  ins.run('e2', 5000);
  ins.run('e3', 800);
  raw.close();
}
seedUsuarios();

test('entre sobre usuarios: 3000..10000 devuelve solo e2', () => {
  const def = { condiciones: [{ campo: 'usuarios' as const, op: 'entre' as const, desde: 3000, hasta: 10000 }] };
  assert.deepEqual(empresasDeSegmento(def, 1).map((e) => e.id), ['e2']);
  assert.equal(contarSegmento(def, 1), 1);
});

test('entre excluye empresas sin dato de usuarios (NULL no matchea rango)', () => {
  // e4 es on_hold pero no tiene fila en empresa_usuarios: con entre queda fuera
  const def = {
    condiciones: [
      { campo: 'estado' as const, op: 'en' as const, valores: ['on_hold'] },
      { campo: 'usuarios' as const, op: 'entre' as const, desde: 0, hasta: 999999 },
    ],
  };
  assert.deepEqual(empresasDeSegmento(def, 1).map((e) => e.id).sort(), ['e1', 'e2', 'e3']);
});

test('entre sobre prioridad (campo numerico ya existente) funciona', () => {
  const def = { condiciones: [{ campo: 'prioridad' as const, op: 'entre' as const, desde: 4, hasta: 6 }] };
  assert.deepEqual(empresasDeSegmento(def, 1).map((e) => e.id).sort(), ['e2', 'e3', 'e6']);
});

test('entre con desde > hasta se rechaza en validacion', () => {
  const def = { condiciones: [{ campo: 'usuarios', op: 'entre', desde: 100, hasta: 5 }] } as never;
  assert.throws(() => empresasDeSegmento(def, 1));
});

test('entre sobre campo de texto (ciudad) se rechaza en validacion', () => {
  const def = { condiciones: [{ campo: 'ciudad', op: 'entre', desde: 1, hasta: 2 }] } as never;
  assert.throws(() => empresasDeSegmento(def, 1));
});

test('es_null sobre usuarios encuentra las empresas sin dato', () => {
  const def = { condiciones: [{ campo: 'usuarios' as const, op: 'es_null' as const }] };
  assert.deepEqual(empresasDeSegmento(def, 1).map((e) => e.id).sort(), ['e4', 'e5', 'e6', 'e7']);
});

test('valoresDistintosCampo devuelve valores unicos ordenados sin null', () => {
  assert.deepEqual(valoresDistintosCampo('estado'), ['on_hold', 'oportunidad']);
  assert.deepEqual(valoresDistintosCampo('categoria'), ['isp', 'utility']);
});

test('valoresDistintosCampo rechaza campos numericos (rango, no dropdown)', () => {
  assert.throws(() => valoresDistintosCampo('usuarios'));
  assert.throws(() => valoresDistintosCampo('prioridad'));
});

// Parte 2 campanas: revision de leads. Un segmento nuevo, sin exclusiones todavia,
// sobre el mismo seed on_hold (e1..e4).
test('empresasParaRevision devuelve todas las del segmento con excluida=false', () => {
  const idSegmento = guardarSegmento({
    nombre: 'revision-1',
    definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] },
  }, 1);
  const revision = empresasParaRevision(idSegmento, 1);
  assert.ok(revision);
  assert.deepEqual(
    revision.map((e) => e.id).sort(),
    ['e1', 'e2', 'e3', 'e4'],
  );
  assert.ok(revision.every((e) => e.excluida === false));
});

test('excluirDeSegmento marca una empresa como excluida en empresasParaRevision', () => {
  const idSegmento = guardarSegmento({
    nombre: 'revision-2',
    definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] },
  }, 1);
  excluirDeSegmento(idSegmento, 'e4');
  const revision = empresasParaRevision(idSegmento, 1);
  assert.ok(revision);
  const e4 = revision.find((e) => e.id === 'e4');
  assert.equal(e4?.excluida, true);
  assert.equal(revision.find((e) => e.id === 'e1')?.excluida, false);
});

test('excluirDeSegmento es idempotente (excluir dos veces no truena ni duplica)', () => {
  const idSegmento = guardarSegmento({
    nombre: 'revision-3',
    definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] },
  }, 1);
  excluirDeSegmento(idSegmento, 'e2');
  excluirDeSegmento(idSegmento, 'e2');
  const revision = empresasParaRevision(idSegmento, 1);
  assert.ok(revision);
  assert.equal(revision.filter((e) => e.id === 'e2' && e.excluida).length, 1);
});

test('incluirDeSegmento deshace una exclusion (toggle de vuelta)', () => {
  const idSegmento = guardarSegmento({
    nombre: 'revision-4',
    definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] },
  }, 1);
  excluirDeSegmento(idSegmento, 'e3');
  incluirDeSegmento(idSegmento, 'e3');
  const revision = empresasParaRevision(idSegmento, 1);
  assert.ok(revision);
  assert.equal(revision.find((e) => e.id === 'e3')?.excluida, false);
});

test('las exclusiones de un segmento no afectan a otro segmento (aislamiento)', () => {
  const idA = guardarSegmento({
    nombre: 'revision-5a',
    definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] },
  }, 1);
  const idB = guardarSegmento({
    nombre: 'revision-5b',
    definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] },
  }, 1);
  excluirDeSegmento(idA, 'e1');
  const revision = empresasParaRevision(idB, 1);
  assert.ok(revision);
  assert.equal(revision.find((e) => e.id === 'e1')?.excluida, false);
});

test('empresasDeSegmento no ve empresas de otra organizacion', () => {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id)
       VALUES ('e-otra-org', 'nit', 'Otra Org', 'otra org', 'activo', 'on_hold', 2)`,
    )
    .run();
  raw.close();

  const def = { condiciones: [{ campo: 'estado' as const, op: 'en' as const, valores: ['on_hold'] }] };
  const desdeOrg1 = empresasDeSegmento(def, 1);
  assert.ok(!desdeOrg1.some((e) => e.id === 'e-otra-org'), 'org 1 no debe ver el lead de la org 2');

  const desdeOrg2 = empresasDeSegmento(def, 2);
  assert.deepEqual(desdeOrg2.map((e) => e.id), ['e-otra-org']);

  // contarSegmento tambien filtra por organizacion
  assert.equal(contarSegmento(def, 1), 4, 'org 1 cuenta sus 4 on_hold');
  assert.equal(contarSegmento(def, 2), 1, 'org 2 cuenta su 1 on_hold');
});

test('empresasDeSegmentoGuardado no corre el segmento de otra organizacion', () => {
  const id = guardarSegmento({
    nombre: 'guardado-org1',
    definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] },
  }, 1);
  assert.equal(empresasDeSegmentoGuardado(id, 2), null, 'la organizacion 2 no puede correr un segmento que no es suyo');
  assert.ok(empresasDeSegmentoGuardado(id, 1));
});

test('empresasParaRevision devuelve null si el segmento es de otra organizacion', () => {
  const id = guardarSegmento({
    nombre: 'revision-otra-org',
    definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] },
  }, 1);
  assert.equal(empresasParaRevision(id, 2), null);
});

test('muestraDestinatarioDeSegmento trae un contacto real del segmento, y null si es de otra organizacion', () => {
  const raw = new Database(dbPath);
  raw
    .prepare(`INSERT INTO contacto (id_empresa, nombre, cargo_categoria, fuente) VALUES (?, ?, ?, ?)`)
    .run('e1', 'Ana', 'gerente', 'seed');
  raw.close();

  const id = guardarSegmento({
    nombre: 'muestra-1',
    definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] },
  }, 1);
  const muestra = muestraDestinatarioDeSegmento(id, 1);
  assert.ok(muestra);
  assert.ok(muestra.nombre.length > 0);

  assert.equal(muestraDestinatarioDeSegmento(id, 2), null, 'otra organizacion no debe ver el destinatario de muestra');
});

test('guardarSegmento escribe el id_organizacion real, no el hardcode', () => {
  const id = guardarSegmento({ nombre: 'seg-org-2', definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] } }, 2);
  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT id_organizacion FROM segmento WHERE id_segmento = ?').get(id) as any;
  raw.close();
  assert.equal(fila.id_organizacion, 2);
});

test('obtenerSegmento devuelve el segmento completo, y null si es de otra organizacion o no existe', () => {
  const id = guardarSegmento(
    { nombre: 'obtener-1', definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] }, descripcionNatural: 'los en on-hold' },
    1,
  );

  const propio = obtenerSegmento(id, 1);
  assert.ok(propio);
  assert.equal(propio!.nombre, 'obtener-1');
  assert.equal(propio!.descripcionNatural, 'los en on-hold');
  assert.deepEqual(propio!.definicion, { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] });

  assert.equal(obtenerSegmento(id, 2), null, 'la organizacion 2 no debe poder leer el segmento de la 1');
  assert.equal(obtenerSegmento(99999, 1), null);
});

test('actualizarSegmento aplica el cambio solo si el segmento es de mi organizacion', () => {
  const id = guardarSegmento({ nombre: 'actualizar-1', definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] } }, 1);

  actualizarSegmento(id, { nombre: 'actualizar-1-otra-org' }, 2);
  assert.equal(obtenerSegmento(id, 1)!.nombre, 'actualizar-1', 'un intento desde otra organizacion no debe cambiar nada');

  actualizarSegmento(id, { nombre: 'actualizar-1-renombrado' }, 1);
  assert.equal(obtenerSegmento(id, 1)!.nombre, 'actualizar-1-renombrado');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
