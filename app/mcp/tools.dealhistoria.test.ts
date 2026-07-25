// deal_historia respondia `empresa_no_encontrada` en DOS casos distintos: la cuenta no existe, o
// existe pero el embudo la deja fuera. Colapsarlos costo caro el 2026-07-25: cinco cuentas
// dieron ese error, se concluyo que habia que CREARLAS, y en realidad solo habia que ENLAZARLAS.
// Crear una cuenta que ya existe es fabricar un duplicado, que es el dano que estos tests evitan.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { dealHistoria } = await import('./tools.ts');

const ORG = 5501;

function seed(id: string, opts: { operaBajo?: string; pageId?: string } = {}) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                            estado_notion, organizacion_activa_id, opera_bajo_id, notion_page_id)
       VALUES (?, 'nit', ?, ?, 'lead', 'lead', ?, ?, ?)`,
    )
    .run(id, `EMPRESA ${id}`, id, ORG, opts.operaBajo ?? null, opts.pageId ?? null);
  raw.close();
}

test.after(() => borrarDbPrueba(dbPath));

test('una cuenta que de verdad no existe sigue dando empresa_no_encontrada', () => {
  const r = dealHistoria({ idEmpresa: 'no-existe-jamas', idOrganizacion: ORG }) as any;
  assert.equal(r.error, 'empresa_no_encontrada');
});

// El caso REDVIVA/CALLTOPBX: existe, pero sin page_id y sin toques el embudo la deja fuera.
test('una cuenta que existe pero esta fuera del embudo lo dice, y dice por que', () => {
  seed('dh-sin-rastro');
  const r = dealHistoria({ idEmpresa: 'dh-sin-rastro', idOrganizacion: ORG }) as any;
  assert.equal(r.error, 'empresa_fuera_del_pipeline');
  assert.match(r.motivo, /sin notion_page_id y sin toques/);
  assert.equal(r.nombreOficial, 'EMPRESA dh-sin-rastro');
  assert.equal(r.estadoNotion, 'lead');
});

// El caso S3WIRELESS/CABLETELCO: es filial, y el embudo la cuenta dentro de su matriz.
test('una filial dice que opera bajo su matriz, con el id de la matriz', () => {
  seed('dh-matriz', { pageId: 'page-dh-matriz' });
  seed('dh-filial', { operaBajo: 'dh-matriz', pageId: 'page-dh-filial' });
  const r = dealHistoria({ idEmpresa: 'dh-filial', idOrganizacion: ORG }) as any;
  assert.equal(r.error, 'empresa_fuera_del_pipeline');
  assert.match(r.motivo, /opera bajo dh-matriz/);
  assert.equal(r.operaBajoId, 'dh-matriz');
});

// Lo que el error tiene que permitir: decidir enlazar en vez de crear. Si no devuelve el
// notionPageId, quien lo lee no puede saber si ya estaba enlazada.
test('el error trae el page_id, que es lo que decide entre enlazar y crear', () => {
  seed('dh-enlazada', { operaBajo: 'dh-matriz', pageId: 'page-ya-enlazada' });
  const r = dealHistoria({ idEmpresa: 'dh-enlazada', idOrganizacion: ORG }) as any;
  assert.equal(r.notionPageId, 'page-ya-enlazada');
});

test('una cuenta de otra organizacion no se filtra hacia afuera', () => {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                            estado_notion, organizacion_activa_id)
       VALUES ('dh-otra-org', 'nit', 'OTRA ORG', 'otra org', 'lead', 'lead', 5502)`,
    )
    .run();
  raw.close();
  const r = dealHistoria({ idEmpresa: 'dh-otra-org', idOrganizacion: ORG }) as any;
  assert.equal(r.error, 'empresa_no_encontrada');
});
