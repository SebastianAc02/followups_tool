// reconciliar_notion con destinoEstado "notion": el espejo del Estado de la ficha. Lo que estos
// tests fijan es la frontera del modo: escribe estado_ficha_notion y su fecha, y NADA de la etapa
// interna, del historial, del owner ni de los campos. Mas el contrato de toda escritura del MCP:
// dry-run por default, respaldo, relectura y error explicito.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { reconciliarNotionTool, cuentasTool } = await import('./tools.ts');

const ORG = 4402;

function seed(id: string, estado: string | null, pageId: string | null, owner: string | null = 'Felipe Castro') {
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

function fila(id: string) {
  const raw = new Database(dbPath);
  const r = raw
    .prepare('SELECT estado_notion, estado_ficha_notion, estado_ficha_notion_fecha, owner FROM empresa WHERE id_empresa = ?')
    .get(id) as any;
  raw.close();
  return r;
}

function historial() {
  const raw = new Database(dbPath);
  const r = (raw.prepare('SELECT count(*) n FROM empresa_estado_historial').get() as any).n as number;
  raw.close();
  return r;
}

const archivosAntes = new Set(fs.readdirSync(path.dirname(dbPath)));
test.after(() => {
  for (const f of fs.readdirSync(path.dirname(dbPath))) {
    if (f.startsWith(`backup-reconciliar-notion-ficha-${path.basename(dbPath, '.db')}-`) && !archivosAntes.has(f)) {
      fs.rmSync(path.join(path.dirname(dbPath), f));
    }
  }
  borrarDbPrueba(dbPath);
});

const P1 = 'f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1';
const P2 = 'f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f2';
const P3 = 'f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3f3';

test('dry-run es el default y no escribe nada', () => {
  seed('fic-1', 'on_hold', P1);
  const r = reconciliarNotionTool({ paginas: [{ pageId: P1, estado: 'Contacto Iniciado' }], destinoEstado: 'notion' }, ORG);
  assert.equal(r.destinoEstado, 'notion');
  assert.equal(r.aplicado, false);
  assert.equal(r.respaldo, null);
  assert.equal(r.escribir.length, 1);
  assert.equal(r.escribir[0].difiereDeInterno, true);
  assert.equal(fila('fic-1').estado_ficha_notion, null, 'el dry-run no puede haber escrito');
});

test('con aplicar escribe el espejo, deja la etapa interna, el owner y el historial intactos', () => {
  const histAntes = historial();
  const r = reconciliarNotionTool(
    {
      paginas: [{ pageId: P1, estado: 'Contacto Iniciado', owner: 'Thomas Schumacher', proximoPaso: 'llamar' }],
      destinoEstado: 'notion',
      aplicar: true,
    },
    ORG,
  );
  assert.equal(r.aplicado, true);
  assert.ok(r.respaldo && fs.existsSync(r.respaldo), 'tiene que haber respaldo en disco');
  assert.equal(r.paginasConCamposIgnorados, 1);
  const f = fila('fic-1');
  assert.equal(f.estado_ficha_notion, 'contacto_iniciado');
  assert.equal(f.estado_notion, 'on_hold', 'la etapa interna no se toca');
  assert.equal(f.owner, 'Felipe Castro', 'el owner no se toca en este modo');
  assert.match(f.estado_ficha_notion_fecha, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(historial(), histAntes, 'no escribe empresa_estado_historial');
  // Lo devuelto es lo releido, no el eco del input.
  assert.deepEqual(r.escrito[0], {
    idEmpresa: 'fic-1',
    nombre: 'EMPRESA fic-1',
    estadoInterno: 'on_hold',
    estadoFichaNotion: 'contacto_iniciado',
    estadoFichaNotionFecha: f.estado_ficha_notion_fecha,
  });
});

test('Firma Pendiente y Contrato Firmado quedan como su propio slug', () => {
  seed('fic-2', 'enviar_contrato', P2);
  seed('fic-3', 'enviar_contrato', P3);
  reconciliarNotionTool(
    {
      paginas: [
        { pageId: P2, estado: 'Firma Pendiente' },
        { pageId: P3, estado: 'Contrato Firmado' },
      ],
      destinoEstado: 'notion',
      aplicar: true,
    },
    ORG,
  );
  assert.equal(fila('fic-2').estado_ficha_notion, 'firma_pendiente');
  assert.equal(fila('fic-3').estado_ficha_notion, 'contrato_firmado');
  assert.equal(fila('fic-2').estado_notion, 'enviar_contrato');
});

test('un estado sin mapeo va a sinMapeo y no se escribe; el resto del lote sigue', () => {
  const r = reconciliarNotionTool(
    {
      paginas: [
        { pageId: P1, estado: 'Lead' },
        { pageId: P2, estado: 'Perdido Para Siempre' },
      ],
      destinoEstado: 'notion',
      aplicar: true,
    },
    ORG,
  );
  assert.deepEqual(r.sinMapeo, [{ pageId: P2, estado: 'Perdido Para Siempre' }]);
  assert.equal(fila('fic-1').estado_ficha_notion, 'lead');
  assert.equal(fila('fic-2').estado_ficha_notion, 'firma_pendiente', 'la que no mapeo quedo como estaba');
});

test('pagina sin cuenta y cuentas sin pagina se reportan', () => {
  const r = reconciliarNotionTool(
    { paginas: [{ pageId: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', estado: 'Lead' }], destinoEstado: 'notion' },
    ORG,
  );
  assert.equal(r.paginasSinCuenta.length, 1);
  assert.deepEqual(r.cuentasSinPagina.map((c) => c.idEmpresa).sort(), ['fic-1', 'fic-2', 'fic-3']);
  assert.equal(r.escribir.length, 0);
});

test('confirma: el mismo valor solo refresca la fecha de lectura', () => {
  const antes = fila('fic-1').estado_ficha_notion_fecha;
  const r = reconciliarNotionTool({ paginas: [{ pageId: P1, estado: 'Lead' }], destinoEstado: 'notion', aplicar: true }, ORG);
  assert.equal(r.confirman, 1);
  assert.equal(r.cambian, 0);
  assert.notEqual(fila('fic-1').estado_ficha_notion_fecha, antes);
});

test('el modo de siempre sigue siendo el default y no toca el espejo', () => {
  const r = reconciliarNotionTool({ paginas: [{ pageId: P1, estado: 'Oportunidad', owner: 'Felipe Castro' }], aplicar: true }, ORG);
  assert.equal(r.destinoEstado, 'interno');
  const f = fila('fic-1');
  assert.equal(f.estado_notion, 'oportunidad');
  assert.equal(f.estado_ficha_notion, 'lead', 'el modo interno no escribe el espejo');
});

test('un destinoEstado desconocido falla explicito', () => {
  assert.throws(
    () => reconciliarNotionTool({ paginas: [{ pageId: P1, estado: 'Lead' }], destinoEstado: 'otro' as any }, ORG),
    /destinoEstado desconocido/,
  );
});

test('la base rechaza un slug fuera de los diez: el CHECK de la 0032 esta en el harness', () => {
  const raw = new Database(dbPath);
  assert.throws(() => raw.prepare("UPDATE empresa SET estado_ficha_notion = 'perdido' WHERE id_empresa = 'fic-1'").run(), /CHECK/);
  raw.close();
});

test('cuentas devuelve el espejo junto a la etapa interna, con sus conteos', () => {
  const r = cuentasTool({ idOrganizacion: ORG });
  const c = r.cuentas.find((x) => x.idEmpresa === 'fic-2')!;
  assert.equal(c.estado, 'enviar_contrato');
  assert.equal(c.estadoFichaNotion, 'firma_pendiente');
  assert.match(c.estadoFichaNotionFecha ?? '', /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(r.sinEstadoFicha, 0);
  // fic-1: oportunidad vs lead; fic-2 y fic-3: enviar_contrato vs firma_pendiente / contrato_firmado.
  assert.equal(r.fichaDistintaDeEstado, 3);
});
