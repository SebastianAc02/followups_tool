// A (2026-07-15): fundirEmpresas (T4) marca la fila absorbida con opera_bajo_id en vez
// de borrarla, para preservar auditoria -- correcto. El bug es que NINGUNA query de
// lectura la excluia: la fila muerta seguia en la UI con el mismo nombre y estado, pero
// sin contactos ni toques (T4 ya los movio al sobreviviente). Sintomas reales: 'Global
// IP' y 'Vision Satelital' duplicados en /cola, 'Mundo Mas' apareciendo 'sin contacto'
// en el segmentador (era la fantasma; la viva tiene a Juan Carlos Ortega), y Global IP
// dos veces en el bucle PBX. 23 filas afectadas.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { colaDelDia, pipelineSinCadencia, embudoPipeline, empresasEnPBX } = await import('./repository.ts');

function raw() {
  return new Database(dbPath);
}

function seedPar(idVivo: string, idFundido: string, estado: string, fecha: string | null) {
  const db = raw();
  // notion_page_id solo en la viva: EN_PIPELINE (Task 7) exige pagina de Notion o un
  // toque para contar como trabajo real; la fundida no la necesita, ya la saca EMPRESA_VIVA.
  for (const [id, operaBajo, pageId] of [
    [idVivo, null, `ntn-${idVivo}`],
    [idFundido, idVivo, null],
  ] as const) {
    db.prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                            estado_notion, proximo_follow_up_fecha, owner, opera_bajo_id, organizacion_activa_id, notion_page_id)
       VALUES (?, 'nit', 'Global IP', 'global ip', 'lead', ?, ?, 'Sebastian Acosta Molina', ?, 1, ?)`,
    ).run(id, estado, fecha, operaBajo, pageId);
  }
  db.close();
}

test('colaDelDia no muestra la fila fundida', () => {
  seedPar('viva-cola', 'fundida-cola', 'lead', '2026-07-01');
  const filas = colaDelDia('2026-07-15', 'Sebastian Acosta Molina', 1);
  const ids = filas.map((f: { id: string }) => f.id);
  assert.ok(ids.includes('viva-cola'), 'la viva si sale');
  assert.ok(!ids.includes('fundida-cola'), 'la fundida NO sale');
});

test('pipelineSinCadencia no muestra la fila fundida', () => {
  seedPar('viva-seg', 'fundida-seg', 'contacto_iniciado', '2026-07-01');
  const filas = pipelineSinCadencia(1, '2026-07-15', 'Sebastian Acosta Molina');
  const ids = filas.map((f) => f.idEmpresa);
  assert.ok(ids.includes('viva-seg'));
  assert.ok(!ids.includes('fundida-seg'));
});

test('embudoPipeline no cuenta la fila fundida', () => {
  seedPar('viva-emb', 'fundida-emb', 'oportunidad', null);
  const filas = embudoPipeline(1);
  const oportunidad = filas.find((f) => f.estado === 'oportunidad');
  assert.ok(oportunidad);
  assert.equal(oportunidad!.total, 1, 'cuenta 1 (la viva), no 2');
});

test('empresasEnPBX no muestra la fila fundida', () => {
  seedPar('viva-pbx', 'fundida-pbx', 'lead', null);
  const ids = empresasEnPBX(1).map((e) => e.id);
  assert.ok(!ids.includes('fundida-pbx'), 'la fundida NO entra al bucle');
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
