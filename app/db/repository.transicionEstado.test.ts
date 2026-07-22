// Fase 5 (docs/plan-produccion-cro-campana.md, "Realidad del deal"): un toque real
// puede graduar la etapa comercial de la empresa. La regla (que estados y que
// resultado disparan que destino) vive en core/transicion-estado.ts y ya tiene su
// propio test puro; esto verifica el CABLEADO end-to-end contra registrarToque:
// que la fila de empresa se actualiza y que empresa_estado_historial queda escrita,
// en la misma transaccion que el toque.

import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { registrarToque } = await import('./repository.ts');

function seedEmpresa(id: string, estado: string | null) {
  const raw = new Database(dbPath);
  raw.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'activo', ?, 1)`,
  ).run(id, id, id, estado);
  raw.close();
}

function leerEmpresa(id: string) {
  const raw = new Database(dbPath);
  const emp = raw.prepare(`SELECT estado_notion FROM empresa WHERE id_empresa = ?`).get(id) as { estado_notion: string | null };
  const historial = raw
    .prepare(`SELECT estado_anterior, estado_nuevo FROM empresa_estado_historial WHERE id_empresa = ? ORDER BY id`)
    .all(id) as { estado_anterior: string | null; estado_nuevo: string }[];
  raw.close();
  return { estado: emp.estado_notion, historial };
}

test('toque sobre on_hold pasa a contacto_iniciado y deja la transicion en el historico', () => {
  seedEmpresa('e-transicion-1', 'on_hold');
  registrarToque({ idEmpresa: 'e-transicion-1', canal: 'llamada', resultado: 'no_contesto' }, 1);

  const { estado, historial } = leerEmpresa('e-transicion-1');
  assert.equal(estado, 'contacto_iniciado');
  assert.equal(historial.length, 1);
  assert.equal(historial[0].estado_anterior, 'on_hold');
  assert.equal(historial[0].estado_nuevo, 'contacto_iniciado');
});

test('reunion agendada (resultado contesto_reunion) desde on_hold salta directo a reunion_agendada', () => {
  seedEmpresa('e-transicion-2', 'on_hold');
  registrarToque({ idEmpresa: 'e-transicion-2', canal: 'llamada', resultado: 'contesto_reunion' }, 1);

  const { estado, historial } = leerEmpresa('e-transicion-2');
  assert.equal(estado, 'reunion_agendada');
  assert.equal(historial.length, 1);
  assert.equal(historial[0].estado_anterior, 'on_hold');
  assert.equal(historial[0].estado_nuevo, 'reunion_agendada');
});

test('reunion agendada desde contacto_iniciado pasa a reunion_agendada', () => {
  seedEmpresa('e-transicion-3', 'contacto_iniciado');
  registrarToque(
    { idEmpresa: 'e-transicion-3', canal: 'llamada', resultado: 'contesto_reunion' },
    1,
  );

  const { estado, historial } = leerEmpresa('e-transicion-3');
  assert.equal(estado, 'reunion_agendada');
  assert.equal(historial.length, 1);
  assert.equal(historial[0].estado_anterior, 'contacto_iniciado');
  assert.equal(historial[0].estado_nuevo, 'reunion_agendada');
});

test('un toque sobre una cuenta ya avanzada (oportunidad) no retrocede ni deja historico', () => {
  seedEmpresa('e-transicion-4', 'oportunidad');
  registrarToque({ idEmpresa: 'e-transicion-4', canal: 'llamada', resultado: 'contesto_reunion' }, 1);

  const { estado, historial } = leerEmpresa('e-transicion-4');
  assert.equal(estado, 'oportunidad');
  assert.equal(historial.length, 0);
});

test('un toque sobre un lead dormido no lo gradua a contacto_iniciado (regla 2026-07-15)', () => {
  seedEmpresa('e-transicion-5', 'lead');
  registrarToque({ idEmpresa: 'e-transicion-5', canal: 'llamada', resultado: 'no_contesto' }, 1);

  const { estado, historial } = leerEmpresa('e-transicion-5');
  assert.equal(estado, 'lead');
  assert.equal(historial.length, 0);
});

test('un segundo toque sobre la misma cuenta ya en contacto_iniciado no vuelve a escribir historico si el resultado no es reunion', () => {
  seedEmpresa('e-transicion-6', 'on_hold');
  registrarToque({ idEmpresa: 'e-transicion-6', canal: 'llamada', resultado: 'no_contesto' }, 1);
  registrarToque({ idEmpresa: 'e-transicion-6', canal: 'llamada', resultado: 'no_contesto' }, 1);

  const { estado, historial } = leerEmpresa('e-transicion-6');
  assert.equal(estado, 'contacto_iniciado');
  assert.equal(historial.length, 1, 'solo la primera transicion (on_hold -> contacto_iniciado) queda registrada');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
