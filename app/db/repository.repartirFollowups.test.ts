// Pruebas de Repository para repartirFollowups (Parte 1 multi-organizacion: antes sin
// test dedicado).
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { repartirFollowups } = await import('./repository.ts');

const OWNER = 'Sebastian Acosta Molina';

function seedEmpresa(id: string, organizacionActivaId = 1) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, owner, proximo_follow_up_fecha, organizacion_activa_id)
       VALUES (?, 'nit', 'Empresa Test', 'empresa test', 'activo', ?, '2026-01-01', ?)`,
    )
    .run(id, OWNER, organizacionActivaId);
  raw.close();
}

test('repartirFollowups solo reparte los leads de la organizacion que llama', () => {
  seedEmpresa('r1');
  seedEmpresa('r2');
  seedEmpresa('r-otra-org', 2);

  const resultado = repartirFollowups(OWNER, 10, 1);
  assert.equal(resultado.total, 2, 'r1+r2 son de la organizacion 1, r-otra-org no debe contarse');

  const raw = new Database(dbPath);
  const otra = raw.prepare('SELECT proximo_follow_up_fecha FROM empresa WHERE id_empresa = ?').get('r-otra-org') as any;
  assert.equal(otra.proximo_follow_up_fecha, '2026-01-01', 'no debe tocarse, es de otra organizacion');
  raw.close();
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
