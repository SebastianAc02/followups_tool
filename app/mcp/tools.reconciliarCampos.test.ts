// reconciliar_notion con los campos opcionales (2026-09-21): usuarios, fecha de ultimo
// contacto, proximo paso con su fecha y razon de perdida. Lo que se defiende:
//  1. Vacio en Notion nunca borra la base.
//  2. Base vacia se llena; base con otro valor se pisa y la pisada sale listada con de/a.
//  3. Usuarios: Notion gana sobre el efectivo, incluso si la base tiene usuarios_reales.
//  4. aplicar:true respalda antes, escribe en una transaccion y devuelve lo RELEIDO.
//  5. El estado deja fila en empresa_estado_historial con origen reconciliacion.
//  6. Una razon que no mapea no se escribe y no tumba la pagina.
//  7. Retrocompatible: una pagina solo con estado/owner se comporta como antes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

// El harness deja usuarios_efectivos como REAL plano; aca se necesita el comportamiento de
// produccion (GENERATED ALWAYS ... STORED), porque es justo lo que decide si Notion gano.
{
  const raw = new Database(dbPath);
  raw.exec(`
    DROP TABLE empresa_usuarios;
    CREATE TABLE empresa_usuarios (
      id_empresa TEXT PRIMARY KEY,
      usuarios_reales REAL,
      usuarios_reales_fuente TEXT,
      usuarios_estimados REAL,
      usuarios_est_fuente TEXT,
      usuarios_efectivos REAL GENERATED ALWAYS AS (COALESCE(usuarios_reales, usuarios_estimados)) STORED,
      actualizado_en TEXT,
      actualizado_por TEXT
    );
  `);
  raw.close();
}

const { reconciliarNotionTool, mapearRazonPerdidaNotion } = await import('./tools.ts');

const ORG = 5501;

function seed(
  id: string,
  pageId: string,
  campos: {
    estado?: string | null;
    owner?: string | null;
    proximoPaso?: string | null;
    proximoFecha?: string | null;
    ultimo?: string | null;
    razon?: string | null;
    reales?: number | null;
    estimados?: number | null;
  } = {},
) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                            estado_notion, organizacion_activa_id, notion_page_id, owner, proximo_paso,
                            proximo_follow_up_fecha, fecha_ultimo_contacto, razon_perdida)
       VALUES (?, 'nit', ?, ?, 'lead', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      `EMPRESA ${id}`,
      id,
      campos.estado === undefined ? 'lead' : campos.estado,
      ORG,
      pageId,
      campos.owner ?? 'Sebastian Acosta Molina',
      campos.proximoPaso ?? null,
      campos.proximoFecha ?? null,
      campos.ultimo ?? null,
      campos.razon ?? null,
    );
  if (campos.reales != null || campos.estimados != null) {
    raw
      .prepare(
        `INSERT INTO empresa_usuarios (id_empresa, usuarios_reales, usuarios_reales_fuente, usuarios_estimados, usuarios_est_fuente)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, campos.reales ?? null, campos.reales != null ? 'factura' : null, campos.estimados ?? null, campos.estimados != null ? 'calculo' : null);
  }
  raw.close();
}

function fila(id: string): any {
  const raw = new Database(dbPath);
  const r = raw
    .prepare(
      `SELECT e.*, u.usuarios_reales, u.usuarios_estimados, u.usuarios_efectivos, u.usuarios_reales_fuente, u.usuarios_est_fuente
       FROM empresa e LEFT JOIN empresa_usuarios u ON u.id_empresa = e.id_empresa WHERE e.id_empresa = ?`,
    )
    .get(id);
  raw.close();
  return r;
}

function historial(id: string): any[] {
  const raw = new Database(dbPath);
  const r = raw.prepare('SELECT * FROM empresa_estado_historial WHERE id_empresa = ? ORDER BY id').all(id);
  raw.close();
  return r;
}

const backupsAntes = new Set(fs.readdirSync(path.dirname(dbPath)));
test.after(() => {
  // Los respaldos que dejo ESTE archivo (VACUUM INTO al lado de la base de prueba).
  for (const f of fs.readdirSync(path.dirname(dbPath))) {
    if (f.startsWith(`backup-reconciliar-notion-${path.basename(dbPath, '.db')}-`) && !backupsAntes.has(f)) fs.rmSync(path.join(path.dirname(dbPath), f));
  }
  borrarDbPrueba(dbPath);
});

const P = (n: number) => String(n).padStart(32, 'a');

test('la razon de perdida mapea etiqueta de Notion y slug, con o sin tilde', () => {
  assert.equal(mapearRazonPerdidaNotion('Ya tiene pasarela'), 'ya_tiene_pasarela');
  assert.equal(mapearRazonPerdidaNotion('  no califica icp '), 'no_califica_icp');
  assert.equal(mapearRazonPerdidaNotion('timing_malo'), 'timing_malo');
  assert.equal(mapearRazonPerdidaNotion('Ghosting'), 'ghosting');
  assert.equal(mapearRazonPerdidaNotion('No califica (ICP)'), 'no_califica');
  assert.equal(mapearRazonPerdidaNotion('no_califica'), 'no_califica');
  assert.equal(mapearRazonPerdidaNotion('No califica ICP'), 'no_califica_icp', 'la etiqueta vieja sigue en su slug');
  assert.equal(mapearRazonPerdidaNotion('Se fue con la competencia'), null);
});

test('Ghosting y No califica (ICP) de Notion se escriben como slug', () => {
  seed('rc-60', P(60));
  seed('rc-61', P(61));
  const r = reconciliarNotionTool(
    {
      paginas: [
        { pageId: P(60), estado: 'On Hold', razonPerdida: 'Ghosting' },
        { pageId: P(61), estado: 'On Hold', razonPerdida: 'No califica (ICP)' },
      ],
      aplicar: true,
    },
    ORG,
  );
  assert.deepEqual(r.razonSinMapeo, []);
  assert.equal(fila('rc-60').razon_perdida, 'ghosting');
  assert.equal(fila('rc-61').razon_perdida, 'no_califica');
});

test('dry-run: llena lo vacio, lista cada pisada con de/a, agrupa por campo y no escribe', () => {
  seed('rc-1', P(1), { proximoPaso: 'Llamar el lunes', ultimo: '2026-08-01', estimados: 800 });
  const r = reconciliarNotionTool(
    {
      paginas: [
        {
          pageId: P(1),
          estado: 'Lead',
          usuarios: 1200,
          fechaUltimoContacto: '2026-09-10',
          proximoPaso: 'Enviar propuesta',
          fechaProximoPaso: '2026-09-25',
          razonPerdida: 'Precio',
        },
      ],
    },
    ORG,
  );
  assert.equal(r.aplicado, false);
  assert.equal(r.respaldo, null);
  assert.equal(r.escrito.length, 0);
  assert.equal(r.alinear.length, 1);
  assert.equal(r.alinear[0].estadoA, null);
  assert.equal(r.porCampo.usuarios.pisadas, 1);
  assert.deepEqual(r.porCampo.usuarios.detallePisadas[0], { idEmpresa: 'rc-1', nombre: 'EMPRESA rc-1', de: 800, a: 1200 });
  assert.equal(r.porCampo.proximo_paso.pisadas, 1);
  assert.equal(r.porCampo.proximo_paso.detallePisadas[0].de, 'Llamar el lunes');
  assert.equal(r.porCampo.fecha_ultimo_contacto.pisadas, 1);
  assert.equal(r.porCampo.proximo_follow_up_fecha.llenados, 1);
  assert.equal(r.porCampo.razon_perdida.llenados, 1);
  assert.equal(fila('rc-1').proximo_paso, 'Llamar el lunes', 'el dry-run no puede escribir');
});

test('aplicar: respalda, escribe todo en la base y devuelve lo releido', () => {
  const r = reconciliarNotionTool(
    {
      paginas: [
        {
          pageId: P(1),
          estado: 'Oportunidad',
          owner: 'Felipe Castro',
          usuarios: 1200,
          fechaUltimoContacto: '2026-09-10',
          proximoPaso: 'Enviar propuesta',
          fechaProximoPaso: '2026-09-25',
          razonPerdida: 'Precio',
        },
      ],
      aplicar: true,
    },
    ORG,
  );
  assert.equal(r.aplicado, true);
  assert.ok(r.respaldo && fs.existsSync(r.respaldo), 'el respaldo tiene que existir en disco');
  const e = r.escrito.find((x) => x.idEmpresa === 'rc-1')!;
  assert.equal(e.estado, 'oportunidad');
  assert.equal(e.owner, 'Felipe Castro');
  assert.equal(e.usuariosEfectivos, 1200);
  assert.equal(e.fechaUltimoContacto, '2026-09-10');
  assert.equal(e.proximoPaso, 'Enviar propuesta');
  assert.equal(e.proximoFollowUpFecha, '2026-09-25');
  assert.equal(e.razonPerdida, 'precio');
  assert.deepEqual({ de: e.transicion?.de, a: e.transicion?.a, origen: e.transicion?.origen }, {
    de: 'lead',
    a: 'oportunidad',
    origen: 'reconciliacion',
  });
  const f = fila('rc-1');
  assert.equal(f.usuarios_estimados, 1200);
  assert.match(f.usuarios_est_fuente, /Notion Usuarios Estimados/);
  assert.equal(historial('rc-1').at(-1).origen, 'reconciliacion');

  // Segunda corrida igual: nada que hacer, ni respaldo.
  const r2 = reconciliarNotionTool(
    {
      paginas: [{ pageId: P(1), estado: 'Oportunidad', owner: 'Felipe Castro', usuarios: 1200, proximoPaso: 'Enviar propuesta' }],
      aplicar: true,
    },
    ORG,
  );
  assert.equal(r2.alinear.length, 0);
  assert.equal(r2.respaldo, null);
});

test('vacio en Notion no borra nada de la base', () => {
  seed('rc-2', P(2), { proximoPaso: 'Reunion jueves', proximoFecha: '2026-09-30', ultimo: '2026-09-01', razon: 'precio', estimados: 500 });
  const r = reconciliarNotionTool(
    {
      paginas: [
        { pageId: P(2), estado: 'Lead', usuarios: null, proximoPaso: '  ', fechaProximoPaso: null, fechaUltimoContacto: null, razonPerdida: '' },
      ],
      aplicar: true,
    },
    ORG,
  );
  assert.equal(r.alinear.length, 0);
  const f = fila('rc-2');
  assert.equal(f.proximo_paso, 'Reunion jueves');
  assert.equal(f.proximo_follow_up_fecha, '2026-09-30');
  assert.equal(f.razon_perdida, 'precio');
  assert.equal(f.usuarios_efectivos, 500);
});

test('usuarios: Notion gana aunque la base tenga usuarios_reales, y el valor viejo queda en la fuente', () => {
  seed('rc-3', P(3), { reales: 3000, estimados: 2500 });
  const seco = reconciliarNotionTool({ paginas: [{ pageId: P(3), estado: 'Lead', usuarios: 60 }] }, ORG);
  assert.equal(seco.alinear[0].campos[0].pisaUsuariosReales, true);
  reconciliarNotionTool({ paginas: [{ pageId: P(3), estado: 'Lead', usuarios: 60 }], aplicar: true }, ORG);
  const f = fila('rc-3');
  assert.equal(f.usuarios_efectivos, 60);
  assert.equal(f.usuarios_reales, 60);
  assert.equal(f.usuarios_estimados, 60);
  assert.match(f.usuarios_reales_fuente, /pisa usuarios_reales=3000, fuente previa: factura/);
});

test('usuarios en 0 no se escriben y se reportan', () => {
  seed('rc-4', P(4), { estimados: 900 });
  const r = reconciliarNotionTool({ paginas: [{ pageId: P(4), estado: 'Lead', usuarios: 0 }], aplicar: true }, ORG);
  assert.equal(r.usuariosNoPositivosIgnorados.length, 1);
  assert.equal(fila('rc-4').usuarios_efectivos, 900);
});

test('una razon que no mapea va a razonSinMapeo y el resto de la pagina se aplica', () => {
  seed('rc-5', P(5));
  const r = reconciliarNotionTool(
    { paginas: [{ pageId: P(5), estado: 'Lead', razonPerdida: 'Se fue con la competencia', proximoPaso: 'Volver a llamar' }], aplicar: true },
    ORG,
  );
  assert.deepEqual(r.razonSinMapeo, [{ pageId: P(5), razonPerdida: 'Se fue con la competencia' }]);
  const f = fila('rc-5');
  assert.equal(f.razon_perdida, null);
  assert.equal(f.proximo_paso, 'Volver a llamar');
});

test('una fecha con hora en la base que cae el mismo dia no cuenta como pisada', () => {
  seed('rc-6', P(6), { proximoFecha: '2026-10-01T12:00:00.000Z' });
  const r = reconciliarNotionTool({ paginas: [{ pageId: P(6), estado: 'Lead', fechaProximoPaso: '2026-10-01' }] }, ORG);
  assert.equal(r.alinear.length, 0);
});

test('retrocompatible: solo estado y owner, como antes', () => {
  seed('rc-7', P(7), { owner: 'Felipe Castro' });
  const r = reconciliarNotionTool({ paginas: [{ pageId: P(7), estado: 'Lead', owner: 'Thomas Schumacher' }], aplicar: true }, ORG);
  assert.equal(r.porCampo.owner.pisadas, 1);
  assert.equal(r.escrito[0].owner, 'Thomas Schumacher');
  assert.equal(r.alinear[0].campos.length, 0);
});

test('camino de error: si una cuenta del lote falla, se revierte el lote entero', () => {
  seed('rc-9a', P(91));
  seed('rc-9b', P(92));
  const raw = new Database(dbPath);
  raw.exec(`CREATE TRIGGER falla_rc9b BEFORE UPDATE ON empresa
            WHEN NEW.id_empresa = 'rc-9b' AND NEW.proximo_paso = 'boom'
            BEGIN SELECT RAISE(ABORT, 'boom'); END;`);
  raw.close();
  assert.throws(
    () =>
      reconciliarNotionTool(
        {
          paginas: [
            { pageId: P(91), estado: 'Oportunidad', proximoPaso: 'Primero bien' },
            { pageId: P(92), estado: 'Lead', proximoPaso: 'boom' },
          ],
          aplicar: true,
        },
        ORG,
      ),
    /boom/,
  );
  const a = fila('rc-9a');
  assert.equal(a.estado_notion, 'lead', 'la primera cuenta no puede quedar escrita');
  assert.equal(a.proximo_paso, null);
  assert.equal(historial('rc-9a').length, 0);
});

test('el respaldo VACUUM INTO queda al lado de la base', async () => {
  const { respaldarBaseAntesDeEscribir } = await import('../db/repository.ts');
  const destino = respaldarBaseAntesDeEscribir('reconciliar-notion');
  assert.ok(fs.existsSync(destino), 'con base en disco el respaldo queda al lado');
});

test('ultimo contacto: gana la fecha mas reciente; Notion mas vieja no pisa y se reporta', () => {
  seed('rc-10', P(10), { ultimo: '2026-09-15' });
  const viejo = reconciliarNotionTool({ paginas: [{ pageId: P(10), estado: 'Lead', fechaUltimoContacto: '2026-09-01' }], aplicar: true }, ORG);
  assert.equal(viejo.alinear.length, 0);
  assert.equal(viejo.porCampo.fecha_ultimo_contacto.pisadas, 0);
  assert.deepEqual(viejo.fechaUltimoContactoMasViejaIgnorada, [
    { pageId: P(10), idEmpresa: 'rc-10', nombre: 'EMPRESA rc-10', produccion: '2026-09-15', notion: '2026-09-01' },
  ]);
  assert.equal(fila('rc-10').fecha_ultimo_contacto, '2026-09-15');

  const nuevo = reconciliarNotionTool({ paginas: [{ pageId: P(10), estado: 'Lead', fechaUltimoContacto: '2026-09-20' }], aplicar: true }, ORG);
  assert.equal(nuevo.porCampo.fecha_ultimo_contacto.pisadas, 1);
  assert.equal(nuevo.fechaUltimoContactoMasViejaIgnorada.length, 0);
  assert.equal(fila('rc-10').fecha_ultimo_contacto, '2026-09-20');
});
