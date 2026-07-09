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

function fechaDe(id: string) {
  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT proximo_follow_up_fecha FROM empresa WHERE id_empresa = ?').get(id) as any;
  raw.close();
  return fila.proximo_follow_up_fecha as string;
}

test('repartirFollowups solo reparte los leads de la organizacion que llama, y SI reescribe la fecha de los que si le tocan', () => {
  seedEmpresa('r1');
  seedEmpresa('r2');
  seedEmpresa('r-otra-org', 2);

  const resultado = repartirFollowups(OWNER, 10, 1);
  assert.equal(resultado.total, 2, 'r1+r2 son de la organizacion 1, r-otra-org no debe contarse');

  // Verificacion de escritura real (no solo el conteo agregado): r1 y r2 deben quedar en el
  // dia que la funcion calculo (resultado.hasta), no en la fecha sembrada original.
  assert.notEqual(fechaDe('r1'), '2026-01-01', 'r1 debe reescribirse: es de la organizacion que reparte');
  assert.notEqual(fechaDe('r2'), '2026-01-01', 'r2 debe reescribirse: es de la organizacion que reparte');
  assert.equal(fechaDe('r1'), resultado.hasta, 'con total=2 y porDia=10 ambos caen en el unico dia calculado');
  assert.equal(fechaDe('r2'), resultado.hasta, 'con total=2 y porDia=10 ambos caen en el unico dia calculado');

  // r-otra-org es de la organizacion 2: esta llamada (organizacion 1) no debe tocarla.
  assert.equal(fechaDe('r-otra-org'), '2026-01-01', 'no debe tocarse, es de otra organizacion');
});

test('repartirFollowups tambien reparte la organizacion 2 cuando se le pide: el filtro no esta hardcodeado a la 1', () => {
  // r-otra-org (organizacion 2) quedo sin tocar en el test anterior: sigue en el backlog
  // con su fecha original, lista para que una llamada con idOrganizacion=2 la reparta.
  const resultado2 = repartirFollowups(OWNER, 10, 2);
  assert.equal(resultado2.total, 1, 'solo r-otra-org es de la organizacion 2 con proximo_follow_up_fecha');

  assert.notEqual(fechaDe('r-otra-org'), '2026-01-01', 'ya no debe seguir en la fecha original sembrada');
  assert.equal(fechaDe('r-otra-org'), resultado2.hasta, 'debe quedar en el dia calculado para esta corrida');

  // r1 y r2 (organizacion 1, ya repartidos en el test anterior) no deben verse afectados
  // por esta llamada a la organizacion 2: prueba que el filtro corre en ambos sentidos.
  assert.notEqual(fechaDe('r1'), '2026-01-01', 'r1 sigue con la fecha que le asigno el reparto de la organizacion 1');
  assert.notEqual(fechaDe('r2'), '2026-01-01', 'r2 sigue con la fecha que le asigno el reparto de la organizacion 1');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
