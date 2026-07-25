// La lista con la que se cruza contra Notion. Lo que estos tests fijan no es el formato, es el
// UNIVERSO: `cuentas` tiene que devolver tambien las empresas sin etapa, porque son justo las
// que `pipeline` esconde y las que rompieron la reconciliacion del 2026-07-25 (REDVIVA existia
// en produccion con NIT, dominio y telefono, pero sin estado_notion, y se concluyo que habia
// que crearla cuando solo habia que enlazarla).
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { cuentasTool } = await import('./tools.ts');

const ORG = 7701;

function seed(
  id: string,
  opts: { estado?: string | null; pageId?: string | null; nombreNotion?: string | null; owner?: string | null } = {},
) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                            estado_notion, organizacion_activa_id, notion_page_id, nombre_notion, owner)
       VALUES (?, 'nit', ?, ?, 'activo', ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      `RAZON SOCIAL ${id} S.A.S`,
      id,
      opts.estado ?? null,
      ORG,
      opts.pageId ?? null,
      opts.nombreNotion ?? null,
      opts.owner ?? null,
    );
  raw.close();
}

test.after(() => borrarDbPrueba(dbPath));

test('trae las cuentas CON etapa', () => {
  seed('c1', { estado: 'oportunidad', pageId: 'page-c1' });
  const r = cuentasTool({ idOrganizacion: ORG });
  assert.ok(r.cuentas.some((c) => c.idEmpresa === 'c1'));
});

// El caso REDVIVA: existe y esta enlazada, pero sin etapa. `pipeline` no la muestra.
test('trae tambien las cuentas SIN etapa que tienen page_id', () => {
  seed('c2', { estado: null, pageId: 'page-c2' });
  const r = cuentasTool({ idOrganizacion: ORG });
  const c2 = r.cuentas.find((c) => c.idEmpresa === 'c2');
  assert.ok(c2, 'una cuenta sin etapa pero enlazada tiene que salir');
  assert.equal(c2!.estado, null);
});

test('trae las cuentas con etapa aunque no tengan page_id: son las que hay que enlazar', () => {
  seed('c3', { estado: 'lead', pageId: null });
  const r = cuentasTool({ idOrganizacion: ORG });
  assert.ok(r.cuentas.some((c) => c.idEmpresa === 'c3'));
});

// Sin etapa Y sin page_id no es del pipeline: es una empresa del universo de prospeccion. Meterla
// aqui inflaria la lista de 476 a 1.956 y volveria inutil el cruce.
test('deja fuera lo que no tiene ni etapa ni page_id', () => {
  seed('c4', { estado: null, pageId: null });
  const r = cuentasTool({ idOrganizacion: ORG });
  assert.equal(r.cuentas.find((c) => c.idEmpresa === 'c4'), undefined);
});

test('separa razon social de nombre de Notion, que es el punto de la columna', () => {
  seed('c5', { estado: 'lead', pageId: 'page-c5', nombreNotion: 'Atlantel', owner: 'Felipe Castro' });
  const c5 = cuentasTool({ idOrganizacion: ORG }).cuentas.find((c) => c.idEmpresa === 'c5');
  assert.equal(c5!.nombre, 'RAZON SOCIAL c5 S.A.S');
  assert.equal(c5!.nombreNotion, 'Atlantel');
  assert.equal(c5!.owner, 'Felipe Castro');
});

test('cuenta cuantas no se pueden cruzar por llave y cuantas no salen en pipeline', () => {
  const r = cuentasTool({ idOrganizacion: ORG });
  assert.equal(r.sinPageId, r.cuentas.filter((c) => !c.notionPageId).length);
  assert.equal(r.sinEtapa, r.cuentas.filter((c) => !c.estado).length);
  assert.equal(r.total, r.cuentas.length);
});

test('no mezcla organizaciones', () => {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                            estado_notion, organizacion_activa_id)
       VALUES ('otra-org', 'nit', 'OTRA', 'otra', 'activo', 'lead', 7702)`,
    )
    .run();
  raw.close();
  const r = cuentasTool({ idOrganizacion: ORG });
  assert.equal(r.cuentas.find((c) => c.idEmpresa === 'otra-org'), undefined);
});
