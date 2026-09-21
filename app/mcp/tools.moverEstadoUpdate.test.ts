// mover_estado con update (2026-09-21): cambiar de etapa y dejar owner / proximo paso / su fecha
// en una sola llamada y una sola transaccion. Lo que se defiende:
//  1. Todo queda escrito junto y se devuelve RELEIDO, con camposActualizados.
//  2. Si la cuenta ya estaba en la etapa, el update igual se escribe (sin fila de historico).
//  3. Un campo vacio es error, no borrado; una fecha mal formada falla y no escribe nada.
//  4. Empresa ajena: nada se escribe.
//  5. Con origen "herramienta", proximo paso y fecha viajan al outbox junto con la etapa.
//  6. Sin update, se comporta exactamente como antes.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { moverEstadoTool } = await import('./tools.ts');
const { outboxPendientes, CLAVE_ENCOLADO_NOTION } = await import('../db/repository.ts');

const ORG = 6601;

function seed(id: string, estado: string, extra: { owner?: string; proximoPaso?: string; fecha?: string } = {}) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion,
                            organizacion_activa_id, notion_page_id, owner, proximo_paso, proximo_follow_up_fecha)
       VALUES (?, 'nit', ?, ?, 'lead', ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, id, id, estado, ORG, `page-${id}`, extra.owner ?? 'Felipe Castro', extra.proximoPaso ?? null, extra.fecha ?? null);
  raw.close();
}

function fila(id: string): any {
  const raw = new Database(dbPath);
  const r = raw.prepare('SELECT * FROM empresa WHERE id_empresa = ?').get(id);
  raw.close();
  return r;
}

function historial(id: string): any[] {
  const raw = new Database(dbPath);
  const r = raw.prepare('SELECT * FROM empresa_estado_historial WHERE id_empresa = ?').all(id);
  raw.close();
  return r;
}

test.after(() => borrarDbPrueba(dbPath));

test('etapa + owner + proximo paso + fecha en una llamada, devuelto releido', () => {
  seed('mu-1', 'contacto_iniciado');
  const r = moverEstadoTool(
    {
      idEmpresa: 'mu-1',
      estado: 'reunion_agendada',
      fecha: '2026-09-21',
      owner: 'Sebastian Acosta Molina',
      proximoPaso: 'Reunion de demo',
      fechaProximoPaso: '2026-09-24',
    },
    ORG,
  );
  assert.equal(r.empresa?.estadoNotion, 'reunion_agendada');
  assert.equal(r.empresa?.owner, 'Sebastian Acosta Molina');
  assert.equal(r.empresa?.proximoPaso, 'Reunion de demo');
  assert.equal(r.empresa?.proximoFollowUpFecha, '2026-09-24');
  assert.deepEqual(r.camposActualizados, ['owner', 'proximo_paso', 'proximo_follow_up_fecha']);
  assert.equal(r.transicion?.a, 'reunion_agendada');
  assert.equal(r.motivo, undefined);
  assert.equal(historial('mu-1').length, 1);
});

test('ya estaba en la etapa: el update se escribe igual y no hay fila de historico', () => {
  seed('mu-2', 'oportunidad', { proximoPaso: 'viejo' });
  const r = moverEstadoTool({ idEmpresa: 'mu-2', estado: 'oportunidad', proximoPaso: 'Mandar propuesta' }, ORG);
  assert.equal(r.motivo, 'sin_cambio');
  assert.equal(r.transicion, null);
  assert.deepEqual(r.camposActualizados, ['proximo_paso']);
  assert.equal(fila('mu-2').proximo_paso, 'Mandar propuesta');
  assert.equal(historial('mu-2').length, 0);
});

test('camino de error: campo vacio o fecha mal formada fallan y no escriben nada', () => {
  seed('mu-3', 'lead', { proximoPaso: 'se queda' });
  assert.throws(() => moverEstadoTool({ idEmpresa: 'mu-3', estado: 'contacto_iniciado', proximoPaso: '   ' }, ORG), /vacio/);
  assert.throws(
    () => moverEstadoTool({ idEmpresa: 'mu-3', estado: 'contacto_iniciado', fechaProximoPaso: '24/09/2026' }, ORG),
    /YYYY-MM-DD/,
  );
  const f = fila('mu-3');
  assert.equal(f.estado_notion, 'lead');
  assert.equal(f.proximo_paso, 'se queda');
  assert.equal(historial('mu-3').length, 0);
});

test('camino de error: empresa de otra organizacion no se toca', () => {
  seed('mu-4', 'lead');
  const r = moverEstadoTool({ idEmpresa: 'mu-4', estado: 'oportunidad', owner: 'Otro' }, 999);
  assert.equal(r.motivo, 'empresa_no_encontrada');
  assert.deepEqual(r.camposActualizados, []);
  assert.equal(fila('mu-4').owner, 'Felipe Castro');
});

test('origen herramienta: etapa, proximo paso y fecha viajan juntos al outbox', () => {
  const raw = new Database(dbPath);
  raw.prepare('INSERT INTO configuracion_admin (clave, valor) VALUES (?, ?)').run(CLAVE_ENCOLADO_NOTION, 'true');
  raw.close();
  seed('mu-5', 'lead');
  moverEstadoTool(
    { idEmpresa: 'mu-5', estado: 'contacto_iniciado', origen: 'herramienta', proximoPaso: 'Llamar', fechaProximoPaso: '2026-09-22' },
    ORG,
  );
  const p = outboxPendientes().find((x) => x.payload.notionPageId === 'page-mu-5');
  assert.ok(p, 'tiene que haber una fila en el outbox');
  assert.equal(p!.payload.estado, 'contacto_iniciado');
  assert.equal(p!.payload.proximoPaso, 'Llamar');
  assert.equal(p!.payload.fechaProximoPaso, '2026-09-22');
});

test('sin update se comporta como antes', () => {
  seed('mu-6', 'lead');
  const r = moverEstadoTool({ idEmpresa: 'mu-6', estado: 'oportunidad' }, ORG);
  assert.deepEqual(r.camposActualizados, []);
  assert.equal(r.transicion?.a, 'oportunidad');
  assert.equal(fila('mu-6').owner, 'Felipe Castro');
});
