// V4.3: pruebas de segmentos. DB de archivo temporal seeded, nunca isps.db real (la
// verificacion contra el conteo real de on_hold va aparte, contra una COPIA, en el
// check en vivo de la tarea, no aca).

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { empresasDeSegmento, contarSegmento, guardarSegmento, empresasDeSegmentoGuardado, listarSegmentos } = await import('./repository.ts');

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
  const empresas = empresasDeSegmento(def);
  assert.deepEqual(empresas.map((e) => e.id).sort(), ['e1', 'e2', 'e3', 'e4']);
  assert.equal(contarSegmento(def), 4);
});

test('condiciones se ANDean: on_hold + isp excluye la utility', () => {
  const def = {
    condiciones: [
      { campo: 'estado' as const, op: 'en' as const, valores: ['on_hold'] },
      { campo: 'categoria' as const, op: 'en' as const, valores: ['isp'] },
    ],
  };
  assert.deepEqual(empresasDeSegmento(def).map((e) => e.id).sort(), ['e1', 'e2', 'e3']);
});

test('campo numerico (prioridad) coerce string->numero y compara bien', () => {
  const def = { condiciones: [{ campo: 'prioridad' as const, op: 'en' as const, valores: ['5'] }] };
  assert.deepEqual(empresasDeSegmento(def).map((e) => e.id).sort(), ['e2', 'e3']);
});

test('operador es_null encuentra la empresa sin estado', () => {
  const def = { condiciones: [{ campo: 'estado' as const, op: 'es_null' as const }] };
  assert.deepEqual(empresasDeSegmento(def).map((e) => e.id), ['e7']);
});

test('no_en excluye valores', () => {
  const def = { condiciones: [{ campo: 'categoria' as const, op: 'no_en' as const, valores: ['utility'] }] };
  // todas menos la utility (e4)
  assert.deepEqual(empresasDeSegmento(def).map((e) => e.id).sort(), ['e1', 'e2', 'e3', 'e5', 'e6', 'e7']);
});

test('guardar y correr el segmento guardado da el mismo resultado', () => {
  const id = guardarSegmento({
    nombre: 'on-hold',
    definicion: { condiciones: [{ campo: 'estado', op: 'en', valores: ['on_hold'] }] },
    descripcionNatural: 'los que estan en on-hold',
  });
  const empresas = empresasDeSegmentoGuardado(id);
  assert.ok(empresas);
  assert.deepEqual(empresas!.map((e) => e.id).sort(), ['e1', 'e2', 'e3', 'e4']);

  const listado = listarSegmentos();
  assert.ok(listado.find((s) => s.nombre === 'on-hold'));
});

test('empresasDeSegmentoGuardado de un id inexistente devuelve null', () => {
  assert.equal(empresasDeSegmentoGuardado(99999), null);
});

test('un campo fuera de la whitelist es rechazado por validacion (no SQL libre)', () => {
  assert.throws(
    () => empresasDeSegmento({ condiciones: [{ campo: 'nombre_oficial', op: 'en', valores: ['x'] }] } as any),
    /invalid|enum|nombre_oficial/i,
  );
});

test('un segmento sin condiciones es rechazado', () => {
  assert.throws(() => empresasDeSegmento({ condiciones: [] } as any), /al menos una condicion/);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
