// Task 12 (plan 2026-07-15-embudo-real-y-registro): identidad_decision es el
// complemento de empresa_alias -- guarda tambien los 'distinto' y 'satelite_de', no solo
// los 'mismo', para que un par ya refutado por Sebastian no se vuelva a proponer.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { registrarDecisionIdentidad, decisionIdentidadDelPar, marcarSatelite } = await import('./repository.ts');

function seedEmpresa(id: string) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, organizacion_activa_id)
       VALUES (?, 'nit', ?, ?, 'activo', 1)`,
    )
    .run(id, id, id.toLowerCase());
  raw.close();
}

test('registrarDecisionIdentidad + decisionIdentidadDelPar: encuentra el par sin importar el orden', () => {
  registrarDecisionIdentidad('sistemas-palacios', 'sp-sistemas-palacios-ltda', 'mismo', 'Sebastian', 'confirmado 2x');
  assert.equal(decisionIdentidadDelPar('sistemas-palacios', 'sp-sistemas-palacios-ltda'), 'mismo');
  assert.equal(decisionIdentidadDelPar('sp-sistemas-palacios-ltda', 'sistemas-palacios'), 'mismo', 'debe encontrar el par invertido');
});

test('decisionIdentidadDelPar devuelve null si el par nunca se decidio', () => {
  assert.equal(decisionIdentidadDelPar('a-no-decidido', 'b-no-decidido'), null);
});

test('registrarDecisionIdentidad distinto: el matcher no debe re-proponer el par', () => {
  registrarDecisionIdentidad('celsia', 'celsia-internet', 'distinto', 'Sebastian', 'son empresas distintas en manejo comercial');
  assert.equal(decisionIdentidadDelPar('celsia', 'celsia-internet'), 'distinto');
});

test('marcarSatelite deja las dos filas vivas, a diferencia de fundirEmpresas (opera_bajo_id)', () => {
  seedEmpresa('emcali-felipe');
  seedEmpresa('emcali-thomas');
  marcarSatelite('emcali-thomas', 'emcali-felipe');

  const raw = new Database(dbPath);
  const satelite = raw.prepare(`SELECT opera_bajo_id, id_empresa_matriz FROM empresa WHERE id_empresa = 'emcali-thomas'`).get() as any;
  const matriz = raw.prepare(`SELECT opera_bajo_id FROM empresa WHERE id_empresa = 'emcali-felipe'`).get() as any;
  raw.close();

  assert.equal(satelite.id_empresa_matriz, 'emcali-felipe');
  assert.equal(satelite.opera_bajo_id, null, 'satelite_de NO es identidad muerta: la fila sigue viva, con su propio deal');
  assert.equal(matriz.opera_bajo_id, null);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
