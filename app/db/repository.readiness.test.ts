// Parte 5 campanas: empresasConReadiness/conteosReadiness. DB propia y aislada (mismo
// motivo que repository.segmentoRol.test.ts: no compartir fixture con conteos exactos
// de otros archivos).

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { empresasConReadiness, conteosReadiness } = await import('./repository.ts');

function seed() {
  const raw = new Database(dbPath);
  const insEmpresa = raw.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, categoria)
     VALUES (?, 'nit', ?, ?, 'activo', 'isp')`,
  );
  insEmpresa.run('A', 'Empresa A', 'empresa-a');
  insEmpresa.run('B', 'Empresa B', 'empresa-b');
  insEmpresa.run('C', 'Empresa C', 'empresa-c');

  const insContacto = raw.prepare(
    `INSERT INTO contacto (id_empresa, nombre, cargo_categoria, email, telefono, fuente) VALUES (?, ?, ?, ?, ?, 'seed')`,
  );
  insContacto.run('A', 'Ana', 'gerente', 'a@a.co', '3001');
  insContacto.run('B', 'Beto', 'tecnico', null, '3002');
  // C sin contacto
  raw.close();
}
seed();

const def = { condiciones: [{ campo: 'categoria' as const, op: 'en' as const, valores: ['isp'] }] };

test('empresasConReadiness clasifica lista/parcial/sin_canal', () => {
  const filas = empresasConReadiness(def, ['correo', 'llamada'], 'saltar');
  const byId = Object.fromEntries(filas.map((f) => [f.id, f.readiness.estado]));
  assert.equal(byId['A'], 'lista');
  assert.equal(byId['B'], 'parcial');
  assert.equal(byId['C'], 'sin_canal');
});

test('conteosReadiness agrega total/listas/parciales/sinCanal/sinContacto', () => {
  const c = conteosReadiness(def, ['correo', 'llamada'], 'saltar');
  assert.deepEqual(c, { total: 3, listas: 1, parciales: 1, sinCanal: 1, sinContacto: 1 });
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
