// Las dos tools del ciclo diario, contra DB real de prueba. El core ya prueba la clasificacion
// (planReconciliacion.test.ts); aca se prueba lo que solo se ve ejecutando: que el dry-run de
// verdad no escriba, y que alinear NO encole nada hacia Notion.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { reconciliarNotionTool, cambiosDesdeTool, registrarToqueTool, moverEstadoTool } = await import('./tools.ts');
const { outboxPendientes } = await import('../db/repository.ts');

const ORG = 4401;
const PAGE = '11112222333344445555666677778888';

function seed(id: string, estado: string | null, pageId: string | null, owner: string | null = null) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                            estado_notion, organizacion_activa_id, notion_page_id, owner)
       VALUES (?, 'nit', ?, ?, 'lead', ?, ?, ?, ?)`,
    )
    .run(id, `EMPRESA ${id}`, id, estado, ORG, pageId, owner);
  raw.close();
}

function estadoDe(id: string) {
  const raw = new Database(dbPath);
  const r = raw.prepare('SELECT estado_notion, owner FROM empresa WHERE id_empresa = ?').get(id) as any;
  raw.close();
  return r;
}

test.after(() => borrarDbPrueba(dbPath));

test('dry-run devuelve el plan y NO escribe: es el default', () => {
  seed('rec-1', 'lead', PAGE, 'Felipe Castro');
  const r = reconciliarNotionTool(
    { paginas: [{ pageId: PAGE, estado: 'Oportunidad', owner: 'Felipe Castro' }] },
    ORG,
  );
  assert.equal(r.aplicado, false);
  assert.equal(r.alinear.length, 1);
  assert.equal(estadoDe('rec-1').estado_notion, 'lead', 'el dry-run no puede haber escrito');
});

test('con aplicar:true alinea el estado a lo que dice Notion', () => {
  const r = reconciliarNotionTool(
    { paginas: [{ pageId: PAGE, estado: 'Oportunidad', owner: 'Felipe Castro' }], aplicar: true },
    ORG,
  );
  assert.equal(r.aplicado, true);
  assert.equal(estadoDe('rec-1').estado_notion, 'oportunidad');
});

// La razon de ser de toda la operacion: el dato vino de Notion, devolverlo es el bounce-back.
test('alinear NO encola nada hacia Notion', () => {
  seed('rec-2', 'lead', '99998888777766665555444433332222', 'Felipe Castro');
  reconciliarNotionTool(
    {
      paginas: [{ pageId: '99998888777766665555444433332222', estado: 'Cierre/Documentación', owner: 'Felipe Castro' }],
      aplicar: true,
    },
    ORG,
  );
  assert.equal(
    outboxPendientes().find((p) => p.payload.notionPageId === '99998888777766665555444433332222'),
    undefined,
  );
});

test('tambien alinea el owner', () => {
  seed('rec-3', 'lead', '12341234123412341234123412341234', 'Felipe Castro');
  reconciliarNotionTool(
    {
      paginas: [{ pageId: '12341234123412341234123412341234', estado: 'Lead', owner: 'Thomas Schumacher' }],
      aplicar: true,
    },
    ORG,
  );
  assert.equal(estadoDe('rec-3').owner, 'Thomas Schumacher');
});

// Una pagina con un Estado que nadie mapeo no puede tumbar el lote entero: ensucia su fila y ya.
test('un estado desconocido va a sinMapeo y el resto del lote sigue', () => {
  seed('rec-4', 'lead', 'abcdabcdabcdabcdabcdabcdabcdabcd', 'Felipe Castro');
  const r = reconciliarNotionTool(
    {
      paginas: [
        { pageId: 'abcdabcdabcdabcdabcdabcdabcdabcd', estado: 'Oportunidad', owner: 'Felipe Castro' },
        { pageId: 'ffffffffffffffffffffffffffffffff', estado: 'Un Estado Que No Existe' },
      ],
      aplicar: true,
    },
    ORG,
  );
  assert.equal(r.sinMapeo.length, 1);
  assert.equal(r.sinMapeo[0].estado, 'Un Estado Que No Existe');
  assert.equal(estadoDe('rec-4').estado_notion, 'oportunidad', 'la pagina buena si se aplico');
});

test('cambios_desde reporta los toques nuevos y las transiciones', () => {
  seed('cam-1', 'contacto_iniciado', 'cccc1111cccc1111cccc1111cccc1111', 'Felipe Castro');
  registrarToqueTool(
    { idEmpresa: 'cam-1', canal: 'llamada', resultado: 'contesto_sigue_seguimiento', quePaso: 'hablamos' } as any,
    ORG,
  );
  moverEstadoTool({ idEmpresa: 'cam-1', estado: 'oportunidad', fecha: '2026-07-25', origen: 'notion' }, ORG);

  const r = cambiosDesdeTool({ desde: '2026-01-01', idOrganizacion: ORG });
  const c = r.cambios.find((x) => x.idEmpresa === 'cam-1');
  assert.ok(c, 'la empresa tocada tiene que salir');
  assert.ok(c!.toquesNuevos >= 1);
  assert.ok(c!.transiciones.some((t) => t.a === 'oportunidad'));
  assert.equal(c!.notionPageId, 'cccc1111cccc1111cccc1111cccc1111');
});

test('cambios_desde no trae lo anterior a la fecha pedida', () => {
  const r = cambiosDesdeTool({ desde: '2099-01-01', idOrganizacion: ORG });
  assert.equal(r.total, 0);
});

// Sin page_id no hay a donde subir el cambio. Se cuentan aparte para no perderlas.
test('cambios_desde cuenta aparte las que no tienen pagina en Notion', () => {
  seed('cam-2', 'lead', null, null);
  registrarToqueTool(
    { idEmpresa: 'cam-2', canal: 'llamada', resultado: 'contesto_sigue_seguimiento', quePaso: 'x' } as any,
    ORG,
  );
  const r = cambiosDesdeTool({ desde: '2026-01-01', idOrganizacion: ORG });
  assert.ok(r.sinPaginaEnNotion >= 1);
});
