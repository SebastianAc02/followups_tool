// Parte 5 campanas: orden (ranking) + limite en empresasDeSegmento. DB propia y aislada
// (mismo motivo que repository.segmentoRol.test.ts).

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { empresasDeSegmento } = await import('./repository.ts');

function seed() {
  const raw = new Database(dbPath);
  const insEmpresa = raw.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, es_cliente)
     VALUES (?, 'nit', ?, ?, 'activo', 0)`,
  );
  insEmpresa.run('grande', 'Grande', 'grande');
  insEmpresa.run('media', 'Media', 'media');
  insEmpresa.run('nula', 'Nula', 'nula'); // sin fila en empresa_usuarios

  const insUsuarios = raw.prepare('INSERT INTO empresa_usuarios (id_empresa, usuarios_estimados) VALUES (?, ?)');
  insUsuarios.run('grande', 300000);
  insUsuarios.run('media', 100000);
  raw.close();
}
seed();

test('empresasDeSegmento ordena por usuarios desc, nulos al final, respeta limite', () => {
  const def = {
    condiciones: [{ campo: 'es_cliente' as const, op: 'entre' as const, desde: 0, hasta: 1 }],
    orden: { campo: 'usuarios' as const, dir: 'desc' as const },
    limite: 2,
  };
  const r = empresasDeSegmento(def);
  assert.deepEqual(
    r.map((e) => e.id),
    ['grande', 'media'],
  );
});

test('empresasDeSegmento sin orden ni limite sigue trayendo todas (comportamiento previo)', () => {
  const def = { condiciones: [{ campo: 'es_cliente' as const, op: 'entre' as const, desde: 0, hasta: 1 }] };
  const r = empresasDeSegmento(def);
  assert.equal(r.length, 3);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
