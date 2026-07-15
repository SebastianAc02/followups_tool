// T7: marcarVetoNotion escribe el veto de Notion en empresa_clasificacion,
// fuente='notion', union con vetos DB existentes (el no gana, nunca se borra).
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { marcarVetoNotion } = await import('./repository.ts');

function seedEmpresa(id: string, nombreOficial: string) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, organizacion_activa_id)
       VALUES (?, 'nit', ?, ?, 'lead', 1)`,
    )
    .run(id, nombreOficial, nombreOficial.toLowerCase());
  raw.close();
}

function seedClasificacion(idEmpresa: string, columnas: Record<string, number>) {
  const raw = new Database(dbPath);
  const cols = Object.keys(columnas);
  const placeholders = cols.map(() => '?').join(', ');
  raw
    .prepare(`INSERT INTO empresa_clasificacion (id_empresa, ${cols.join(', ')}) VALUES (?, ${placeholders})`)
    .run(idEmpresa, ...cols.map((c) => columnas[c]));
  raw.close();
}

function leerClasificacion(idEmpresa: string) {
  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT * FROM empresa_clasificacion WHERE id_empresa = ?').get(idEmpresa) as
    | Record<string, unknown>
    | undefined;
  raw.close();
  return fila;
}

function leerCategoria(idEmpresa: string) {
  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT categoria FROM empresa_categoria WHERE id_empresa = ?').get(idEmpresa) as
    | { categoria: string }
    | undefined;
  raw.close();
  return fila?.categoria;
}

test('ENEL (Industria Energia -> es_utility_no_isp) queda fuera de isp en la vista empresa_categoria', () => {
  seedEmpresa('enel-1', 'ENEL Colombia');

  marcarVetoNotion('enel-1', 'es_utility_no_isp');

  const fila = leerClasificacion('enel-1');
  assert.equal(fila?.es_utility_no_isp, 1);
  assert.equal(fila?.fuente, 'notion');

  assert.equal(leerCategoria('enel-1'), 'utility');
});

test('no borra un veto DB existente (union, el no gana): es_carrier previo sobrevive junto al nuevo flag', () => {
  seedEmpresa('carrier-1', 'Carrier Existente SAS');
  seedClasificacion('carrier-1', { es_carrier: 1 });

  marcarVetoNotion('carrier-1', 'es_utility_no_isp');

  const fila = leerClasificacion('carrier-1');
  assert.equal(fila?.es_carrier, 1);
  assert.equal(fila?.es_utility_no_isp, 1);
  assert.equal(fila?.fuente, 'notion');
});

test('es idempotente: llamar dos veces con el mismo flag no duplica fila ni cambia el resultado', () => {
  seedEmpresa('idem-1', 'Idempotente SAS');

  marcarVetoNotion('idem-1', 'es_no_isp_confirmado');
  marcarVetoNotion('idem-1', 'es_no_isp_confirmado');

  const raw = new Database(dbPath);
  const n = raw.prepare('SELECT COUNT(*) as n FROM empresa_clasificacion WHERE id_empresa = ?').get('idem-1') as { n: number };
  raw.close();

  assert.equal(n.n, 1);
  assert.equal(leerClasificacion('idem-1')?.es_no_isp_confirmado, 1);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
