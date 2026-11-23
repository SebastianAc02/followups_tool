// fusionar_empresas: la misma empresa existe dos o tres veces (una con NIT, otras provisionales) y
// se funde en la del NIT. Lo que estos tests protegen:
//   - que el seco no escriba nada y que su plan sea el mismo que despues se aplica;
//   - que nada quede a medias: toques, contactos, historial y toda tabla con id_empresa terminan en
//     el destino, o la transaccion se revierte entera;
//   - que los caminos que piden una decision humana fallen en vez de inventarla: destino sin NIT,
//     dos fichas de Notion, origen inexistente, origen con NIT, on_hold contra etapa activa, y dos
//     inscripciones activas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();

// auditoria_campo y su trigger vienen de las migraciones, igual que en produccion (mismo corte que
// app/db/auditoria-campo.test.ts): se ejecuta el SQL real, no una copia.
{
  const raw = new Database(dbPath);
  const dir = path.join(process.cwd(), 'drizzle');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    const contenido = fs.readFileSync(path.join(dir, f), 'utf8');
    if (!contenido.includes('auditoria_campo')) continue;
    for (const stmt of contenido.split('--> statement-breakpoint')) if (stmt.trim()) raw.exec(stmt);
  }
  raw.close();
}

process.env.ISPS_DB_PATH = dbPath;

const { fusionarEmpresasTool } = await import('./tools.ts');
const { TOOLS_ESCRITURA, TOOLS_LECTURA } = await import('./server.ts');

const ORG = 7701;

type Semilla = {
  tipo?: string;
  estado?: string | null;
  owner?: string | null;
  page?: string | null;
  proximoPaso?: string | null;
  crm?: string | null;
  org?: number;
};

function seed(id: string, nombre: string, s: Semilla = {}) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion,
                            owner, notion_page_id, proximo_paso, crm_software, organizacion_activa_id)
       VALUES (?, ?, ?, ?, 'lead', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      s.tipo ?? 'interno',
      nombre,
      nombre.toLowerCase(),
      s.estado ?? null,
      s.owner ?? null,
      s.page ?? null,
      s.proximoPaso ?? null,
      s.crm ?? null,
      s.org ?? ORG,
    );
  raw.close();
}

function exec(sqlText: string, ...params: unknown[]) {
  const raw = new Database(dbPath);
  raw.prepare(sqlText).run(...(params as any[]));
  raw.close();
}

function fila(sqlText: string, ...params: unknown[]): any {
  const raw = new Database(dbPath);
  const r = raw.prepare(sqlText).get(...(params as any[]));
  raw.close();
  return r;
}

const n = (tabla: string, id: string) => fila(`SELECT count(*) AS n FROM ${tabla} WHERE id_empresa = ?`, id).n as number;

function contacto(id: string, nombre: string, principal = 0) {
  exec(`INSERT INTO contacto (id_empresa, nombre, fuente, es_principal) VALUES (?, ?, 'notion', ?)`, id, nombre, principal);
}
function toqueDe(id: string) {
  exec(`INSERT INTO toque (id_empresa, fecha, fuente, id_organizacion) VALUES (?, '2026-09-11', 'brain', ?)`, id, ORG);
}

test.after(() => {
  for (const f of fs.readdirSync(path.dirname(dbPath))) {
    if (f.startsWith('backup-fusionar-empresas-') && f.includes(path.basename(dbPath, '.db'))) {
      fs.rmSync(path.join(path.dirname(dbPath), f));
    }
  }
  borrarDbPrueba(dbPath);
});

test('fusionar_empresas es de escritura, nunca de lectura', () => {
  assert.ok((TOOLS_ESCRITURA as readonly string[]).includes('fusionar_empresas'));
  assert.ok(!(TOOLS_LECTURA as readonly string[]).includes('fusionar_empresas'));
});

// El caso que origino la accion, reducido: el destino con NIT en contacto_iniciado, la cuenta viva
// (provisional, oportunidad, con ficha y owner) y una tercera provisional en lead sin ficha.
test('en seco: devuelve el plan completo y no escribe nada', () => {
  seed('828000170', 'TV SANV SAS', { tipo: 'nit', estado: 'contacto_iniciado' });
  seed('9990000021', 'AlpaSurfnet', {
    estado: 'oportunidad',
    owner: 'Felipe Castro',
    page: 'page-viva',
    proximoPaso: 'Pendiente reunion',
    crm: 'SoftV',
  });
  seed('9990000148', 'T.V. SANV S A S ALPAVISION HD', { estado: 'lead' });
  contacto('828000170', 'Jhon');
  contacto('9990000021', 'Gabriel Garzon', 1);
  toqueDe('9990000021');
  toqueDe('9990000021');
  exec(`INSERT INTO empresa_estado_historial (id_empresa, estado_anterior, estado_nuevo, fecha, origen, id_organizacion)
        VALUES ('9990000021', 'reunion_agendada', 'oportunidad', '2026-09-21', 'reconciliacion', ?)`, ORG);
  exec(`INSERT INTO empresa_usuarios (id_empresa, usuarios_estimados, usuarios_est_fuente) VALUES ('828000170', 10980, 'modelo')`);
  exec(`INSERT INTO empresa_usuarios (id_empresa, usuarios_reales, usuarios_reales_fuente) VALUES ('9990000021', 10000, 'notion_on_hold')`);
  exec(`INSERT INTO empresa_estado_snapshot (id_empresa, estado, fecha_snapshot, id_organizacion) VALUES ('9990000021', 'oportunidad', '2026-11-22', ?)`, ORG);
  const auditoriaAntes = fila(`SELECT count(*) AS n FROM auditoria_campo`).n;

  const r = fusionarEmpresasTool({ idDestino: '828000170', idsOrigen: ['9990000021', '9990000148'] }, ORG);

  assert.equal(r.aplicado, false);
  assert.equal(r.respaldo, null);
  assert.deepEqual(r.filasMovidas.toque, { '9990000021': 2 });
  assert.deepEqual(r.filasMovidas.contacto, { '9990000021': 1 });
  assert.deepEqual(r.filasMovidas.empresa_estado_historial, { '9990000021': 1 });
  assert.equal(r.notionPage.final, 'page-viva');
  assert.deepEqual(r.transicion, { de: 'contacto_iniciado', a: 'oportunidad' });
  assert.equal(r.destino.estado, 'oportunidad');
  assert.equal(r.destino.owner, 'Felipe Castro');
  assert.equal(r.destino.proximoPaso, 'Pendiente reunion');
  assert.equal(r.destino.notionPageId, 'page-viva');
  assert.deepEqual(r.conteos, { antes: { toques: 2, contactos: 2 }, despues: { toques: 2, contactos: 2 } });
  assert.deepEqual(r.aliasAgregados, ['AlpaSurfnet', 'T.V. SANV S A S ALPAVISION HD']);
  const owner = r.camposDestino.find((c) => c.campo === 'owner');
  assert.deepEqual(owner, { tabla: 'empresa', campo: 'owner', anterior: null, nuevo: 'Felipe Castro', desde: '9990000021' });
  // empresa_usuarios es 1 a 1: el destino ya tiene fila, asi que se rellena su hueco y la del origen se queda.
  assert.ok(r.camposDestino.some((c) => c.tabla === 'empresa_usuarios' && c.campo === 'usuarios_reales' && c.nuevo === 10000));
  assert.ok(r.filasQueQuedanEnOrigen.some((f) => f.tabla === 'empresa_estado_snapshot' && f.idOrigen === '9990000021'));

  // Nada se escribio.
  assert.equal(n('toque', '9990000021'), 2);
  assert.equal(n('contacto', '828000170'), 1);
  assert.equal(fila(`SELECT estado_notion FROM empresa WHERE id_empresa='828000170'`).estado_notion, 'contacto_iniciado');
  assert.equal(fila(`SELECT opera_bajo_id FROM empresa WHERE id_empresa='9990000021'`).opera_bajo_id, null);
  assert.equal(fila(`SELECT notion_page_id FROM empresa WHERE id_empresa='9990000021'`).notion_page_id, 'page-viva');
  assert.equal(fila(`SELECT count(*) AS n FROM auditoria_campo`).n, auditoriaAntes);
  assert.equal(fila(`SELECT count(*) AS n FROM sync_cambios WHERE corrida='fusionar_empresas'`).n, 0);
});

test('con aplicar: escribe, relee, deja respaldo, lapida y auditoria', () => {
  const r = fusionarEmpresasTool({ idDestino: '828000170', idsOrigen: ['9990000021', '9990000148'], aplicar: true }, ORG);

  assert.equal(r.aplicado, true);
  assert.ok(r.respaldo && fs.existsSync(r.respaldo), 'el respaldo VACUUM INTO tiene que existir');
  assert.equal(n('toque', '828000170'), 2);
  assert.equal(n('toque', '9990000021'), 0);
  assert.equal(n('contacto', '828000170'), 2);
  assert.equal(n('empresa_estado_snapshot', '9990000021'), 1, 'la foto diaria se queda con el id que fotografio');

  const d = fila(`SELECT * FROM empresa WHERE id_empresa='828000170'`);
  assert.equal(d.estado_notion, 'oportunidad');
  assert.equal(d.owner, 'Felipe Castro');
  assert.equal(d.notion_page_id, 'page-viva');
  assert.equal(d.crm_software, 'SoftV');
  assert.equal(d.nombre_oficial, 'TV SANV SAS');
  assert.equal(fila(`SELECT usuarios_reales FROM empresa_usuarios WHERE id_empresa='828000170'`).usuarios_reales, 10000);

  const t = fila(`SELECT estado_anterior, estado_nuevo, origen FROM empresa_estado_historial WHERE id_empresa='828000170' ORDER BY id DESC LIMIT 1`);
  assert.deepEqual({ ...t }, { estado_anterior: 'contacto_iniciado', estado_nuevo: 'oportunidad', origen: 'fusion' });

  for (const o of ['9990000021', '9990000148']) {
    const lapida = fila(`SELECT opera_bajo_id, notion_page_id, estado_notion, owner FROM empresa WHERE id_empresa=?`, o);
    assert.deepEqual({ ...lapida }, { opera_bajo_id: '828000170', notion_page_id: null, estado_notion: null, owner: null });
  }
  // El trigger dejo el valor previo de lo que se limpio en la lapida, y la accion dejo los movimientos.
  assert.ok(fila(`SELECT 1 AS x FROM auditoria_campo WHERE id_registro='9990000021' AND campo='notion_page_id' AND valor_anterior='page-viva'`));
  assert.ok(fila(`SELECT 1 AS x FROM auditoria_campo WHERE id_registro='828000170' AND campo='owner' AND valor_nuevo='Felipe Castro'`));
  assert.ok(fila(`SELECT 1 AS x FROM auditoria_campo WHERE tabla='toque' AND id_registro='9990000021' AND valor_nuevo='828000170'`));
  assert.equal(fila(`SELECT count(*) AS n FROM sync_cambios WHERE corrida='fusionar_empresas'`).n, 2);
  assert.deepEqual(r.destino.alias, ['AlpaSurfnet', 'T.V. SANV S A S ALPAVISION HD']);
});

test('un origen ya fusionado no se fusiona dos veces', () => {
  assert.throws(
    () => fusionarEmpresasTool({ idDestino: '828000170', idsOrigen: ['9990000021'] }, ORG),
    /ya esta fusionado en 828000170/,
  );
});

test('destino sin NIT: falla y lo pide', () => {
  seed('9990000301', 'PROVISIONAL A', { estado: 'lead' });
  seed('9990000302', 'PROVISIONAL B', { estado: 'lead' });
  assert.throws(
    () => fusionarEmpresasTool({ idDestino: '9990000301', idsOrigen: ['9990000302'] }, ORG),
    /no tiene NIT real/,
  );
});

test('page ids en conflicto: falla y nombra las dos fichas; con notionPageId elige la viva', () => {
  seed('901000111', 'GAMA SAS', { tipo: 'nit', estado: 'lead' });
  seed('9990000401', 'Gama', { estado: 'oportunidad', page: 'page-gama-viva' });
  seed('9990000402', 'Gama TV', { estado: 'lead', page: 'page-gama-vieja' });
  toqueDe('9990000401');

  assert.throws(
    () => fusionarEmpresasTool({ idDestino: '901000111', idsOrigen: ['9990000401', '9990000402'], aplicar: true }, ORG),
    /page ids de Notion en conflicto.*9990000401 -> page-gama-viva.*9990000402 -> page-gama-vieja/,
  );
  assert.equal(n('toque', '9990000401'), 1, 'el fallo no escribio nada');

  assert.throws(
    () => fusionarEmpresasTool({ idDestino: '901000111', idsOrigen: ['9990000401', '9990000402'], notionPageId: 'otra' }, ORG),
    /no es de ninguna de las cuentas/,
  );

  const r = fusionarEmpresasTool(
    { idDestino: '901000111', idsOrigen: ['9990000401', '9990000402'], notionPageId: 'page-gama-viva' },
    ORG,
  );
  assert.equal(r.notionPage.final, 'page-gama-viva');
  assert.deepEqual(r.notionPage.descartados, ['page-gama-vieja']);
  assert.ok(r.avisos.some((a) => a.includes('page-gama-vieja')));
});

test('el destino con su propia ficha y un origen con otra: tambien es conflicto', () => {
  seed('901000222', 'DELTA SAS', { tipo: 'nit', estado: 'lead', page: 'page-delta-a' });
  seed('9990000501', 'Delta', { estado: 'lead', page: 'page-delta-b' });
  assert.throws(
    () => fusionarEmpresasTool({ idDestino: '901000222', idsOrigen: ['9990000501'] }, ORG),
    /page ids de Notion en conflicto/,
  );
});

test('origen inexistente: falla, lo nombra y no escribe nada', () => {
  seed('901000333', 'EPSILON SAS', { tipo: 'nit', estado: 'lead' });
  seed('9990000601', 'Epsilon', { estado: 'lead' });
  toqueDe('9990000601');
  assert.throws(
    () => fusionarEmpresasTool({ idDestino: '901000333', idsOrigen: ['9990000601', '9990009999'], aplicar: true }, ORG),
    /empresa_no_encontrada: origen 9990009999/,
  );
  assert.equal(n('toque', '9990000601'), 1);
  assert.equal(fila(`SELECT opera_bajo_id FROM empresa WHERE id_empresa='9990000601'`).opera_bajo_id, null);
});

test('origen de otra organizacion cuenta como inexistente', () => {
  seed('9990000602', 'Epsilon otra org', { estado: 'lead', org: ORG + 1 });
  assert.throws(
    () => fusionarEmpresasTool({ idDestino: '901000333', idsOrigen: ['9990000602'] }, ORG),
    /empresa_no_encontrada: origen 9990000602/,
  );
});

test('destino inexistente: falla', () => {
  assert.throws(
    () => fusionarEmpresasTool({ idDestino: '901999999', idsOrigen: ['9990000601'] }, ORG),
    /empresa_no_encontrada: destino 901999999/,
  );
});

test('un origen con NIT real no se absorbe: dos NIT son dos razones sociales', () => {
  seed('901000444', 'ZETA SAS', { tipo: 'nit', estado: 'lead' });
  seed('901000445', 'ZETA DOS SAS', { tipo: 'nit', estado: 'lead' });
  assert.throws(
    () => fusionarEmpresasTool({ idDestino: '901000444', idsOrigen: ['901000445'] }, ORG),
    /tiene NIT real/,
  );
});

test('on_hold contra una etapa activa: falla en vez de inventar la regla', () => {
  seed('901000555', 'ETA SAS', { tipo: 'nit', estado: 'on_hold' });
  seed('9990000701', 'Eta', { estado: 'oportunidad' });
  assert.throws(
    () => fusionarEmpresasTool({ idDestino: '901000555', idsOrigen: ['9990000701'] }, ORG),
    /on_hold y en oportunidad/,
  );
});

test('dos inscripciones activas chocan: falla explicito y revierte', () => {
  seed('901000666', 'THETA SAS', { tipo: 'nit', estado: 'lead' });
  seed('9990000801', 'Theta', { estado: 'lead' });
  toqueDe('9990000801');
  exec(`INSERT INTO inscripcion (id_campana, id_empresa, estado) VALUES (1, '901000666', 'activa')`);
  exec(`INSERT INTO inscripcion (id_campana, id_empresa, estado) VALUES (2, '9990000801', 'activa')`);
  assert.throws(
    () => fusionarEmpresasTool({ idDestino: '901000666', idsOrigen: ['9990000801'], aplicar: true }, ORG),
    /chocan en inscripcion/,
  );
  assert.equal(n('toque', '9990000801'), 1, 'los toques ya movidos en la misma transaccion se revirtieron');
});

test('contacto principal en los dos: el del origen baja a no principal y se reporta', () => {
  seed('901000777', 'IOTA SAS', { tipo: 'nit', estado: 'lead' });
  seed('9990000901', 'Iota', { estado: 'lead' });
  contacto('901000777', 'Ana', 1);
  contacto('9990000901', 'Beto', 1);
  const r = fusionarEmpresasTool({ idDestino: '901000777', idsOrigen: ['9990000901'], aplicar: true }, ORG);
  assert.deepEqual(r.principalesDegradados, [{ tabla: 'contacto', idOrigen: '9990000901', filas: 1 }]);
  assert.equal(fila(`SELECT count(*) AS n FROM contacto WHERE id_empresa='901000777' AND es_principal=1`).n, 1);
  assert.equal(fila(`SELECT es_principal FROM contacto WHERE nombre='Beto'`).es_principal, 0);
  assert.equal(r.destino.contactos, 2);
});

test('lo que el destino ya tiene no se pisa', () => {
  seed('901000888', 'KAPPA SAS', { tipo: 'nit', estado: 'lead', owner: 'Sebastian Acosta Molina', proximoPaso: 'Llamar lunes' });
  seed('9990001001', 'Kappa', { estado: 'reunion_agendada', owner: 'Felipe Castro', proximoPaso: 'Reunion jueves' });
  const r = fusionarEmpresasTool({ idDestino: '901000888', idsOrigen: ['9990001001'] }, ORG);
  assert.equal(r.destino.owner, 'Sebastian Acosta Molina');
  assert.equal(r.destino.proximoPaso, 'Llamar lunes');
  assert.equal(r.destino.estado, 'reunion_agendada');
  assert.ok(!r.camposDestino.some((c) => c.campo === 'owner' || c.campo === 'proximo_paso'));
});


test('mismo canal marcado en las dos: manda el del destino, el del origen queda en la lapida y se avisa', () => {
  seed('901000999', 'LAMBDA SAS', { tipo: 'nit', estado: 'lead' });
  seed('9990001101', 'Lambda', { estado: 'lead' });
  const canal = (id: string, c: string, estado: string) =>
    exec(
      `INSERT INTO canal_estado (id_empresa, canal, estado, fuente, quien, fecha, id_organizacion)
       VALUES (?, ?, ?, 'operador', 'Sebastian', '2026-11-20', ?)`,
      id, c, estado, ORG,
    );
  canal('901000999', 'llamada', 'vivo');
  canal('9990001101', 'llamada', 'muerto');
  canal('9990001101', 'whatsapp', 'vivo');
  const r = fusionarEmpresasTool({ idDestino: '901000999', idsOrigen: ['9990001101'], aplicar: true }, ORG);
  assert.equal(fila(`SELECT estado FROM canal_estado WHERE id_empresa='901000999' AND canal='llamada'`).estado, 'vivo');
  assert.equal(fila(`SELECT estado FROM canal_estado WHERE id_empresa='901000999' AND canal='whatsapp'`).estado, 'vivo');
  assert.equal(n('canal_estado', '9990001101'), 1);
  assert.ok(r.filasQueQuedanEnOrigen.some((f) => f.tabla === 'canal_estado' && f.filas === 1));
  assert.ok(r.avisos.some((a) => a.includes('canal llamada') && a.includes('muerto')));
});

test('owner y proximo paso distintos en el origen: no se pisan, pero se avisan', () => {
  seed('901001111', 'MU SAS', { tipo: 'nit', estado: 'lead', owner: 'Sebastian Acosta Molina', proximoPaso: 'Llamar lunes' });
  seed('9990001201', 'Mu', { estado: 'oportunidad', owner: 'Felipe Castro', proximoPaso: 'Reunion jueves' });
  const r = fusionarEmpresasTool({ idDestino: '901001111', idsOrigen: ['9990001201'] }, ORG);
  assert.equal(r.destino.owner, 'Sebastian Acosta Molina');
  assert.ok(r.avisos.some((a) => a.startsWith('owner:') && a.includes('Felipe Castro')));
  assert.ok(r.avisos.some((a) => a.startsWith('proximo_paso:') && a.includes('Reunion jueves')));
});
