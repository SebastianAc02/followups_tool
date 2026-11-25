// El contrato del MCP para grupo empresarial y la coherencia de aliado, por el Client real del
// SDK: el inputSchema de registerTool bota en silencio las llaves que no declaro, asi que un
// campo puede existir en el dominio y no poder mandarse desde afuera.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { crearMcpServer, TOOLS_ESCRITURA, TOOLS_LECTURA } = await import('./server.ts');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

test.after(() => borrarDbPrueba(dbPath));

const QUIEN = 'Sebastian Acosta Molina';

// El harness no trae empresa_municipio ni empresa_telefono ni las columnas de rol del contacto
// (en produccion vienen del seed). Misma forma que en tools.cobertura.test.ts.
const raw = new Database(dbPath);
raw.exec(`
  CREATE TABLE empresa_municipio (
    id_empresa TEXT NOT NULL, codigo_divipola INTEGER NOT NULL, municipio TEXT NOT NULL,
    codigo_depto INTEGER, departamento TEXT, accesos INTEGER NOT NULL, periodo TEXT NOT NULL,
    PRIMARY KEY (id_empresa, codigo_divipola, periodo)
  );
  CREATE TABLE empresa_telefono (
    id_telefono INTEGER PRIMARY KEY AUTOINCREMENT, id_empresa TEXT NOT NULL, id_contacto INTEGER,
    tipo TEXT NOT NULL, numero TEXT NOT NULL, fuente TEXT NOT NULL, verificado INTEGER NOT NULL DEFAULT 0,
    verificado_at TEXT, es_linea_empresa INTEGER, es_principal INTEGER NOT NULL DEFAULT 0
  );
  ALTER TABLE contacto ADD COLUMN es_rep_legal INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE contacto ADD COLUMN es_gerente INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE contacto ADD COLUMN telefono_fuente TEXT;
`);
raw.close();

function seed(id: string, o: { matriz?: string; usuarios?: number; accesos?: number } = {}) {
  const db = new Database(dbPath);
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                          estado_notion, organizacion_activa_id, notion_page_id, id_empresa_matriz, ciudad_principal, departamento)
     VALUES (?, 'nit', ?, ?, 'activo', 'contacto_iniciado', 1, ?, ?, 'Pasto', 'Nariño')`,
  ).run(id, `NOMBRE ${id}`, id, `ntn-${id}`, o.matriz ?? null);
  if (o.usuarios != null) {
    db.prepare(`INSERT INTO empresa_usuarios (id_empresa, usuarios_estimados, usuarios_efectivos) VALUES (?, ?, ?)`).run(id, o.usuarios, o.usuarios);
  }
  if (o.accesos != null) {
    db.prepare(
      `INSERT INTO empresa_municipio (id_empresa, codigo_divipola, municipio, codigo_depto, departamento, accesos, periodo)
       VALUES (?, 52001, 'PASTO', 52, 'Nariño', ?, '2025-T4')`,
    ).run(id, o.accesos);
  }
  db.close();
}

async function conectar(escritura = true) {
  const servidor = crearMcpServer({ escritura, idOrganizacion: 1 });
  const cliente = new Client({ name: 'prueba-grupo', version: '1.0.0' });
  const [t1, t2] = InMemoryTransport.createLinkedPair();
  await Promise.all([servidor.connect(t2), cliente.connect(t1)]);
  return cliente;
}

type Respuesta = { isError?: boolean; content: { text: string }[] };
const leer = (res: unknown) => JSON.parse((res as Respuesta).content[0].text);

test('marcar_grupo es de escritura y no se lista sin el permiso', async () => {
  assert.ok((TOOLS_ESCRITURA as readonly string[]).includes('marcar_grupo'));
  assert.equal((TOOLS_LECTURA as readonly string[]).includes('marcar_grupo'), false);
  const lector = await conectar(false);
  const { tools } = await lector.listTools();
  assert.equal(tools.some((t) => t.name === 'marcar_grupo'), false);
});

test('el inputSchema de marcar_grupo exige idEmpresa, idMatriz, fuente y quien', async () => {
  const cliente = await conectar();
  const { tools } = await cliente.listTools();
  const esquema = tools.find((t) => t.name === 'marcar_grupo')?.inputSchema as { required?: string[]; properties?: Record<string, unknown> };
  for (const campo of ['idEmpresa', 'idMatriz', 'fuente', 'quien']) {
    assert.ok(esquema.required?.includes(campo), `${campo} tiene que ser obligatorio`);
  }
  assert.ok(esquema.properties?.nota, 'nota se puede mandar');
});

test('marcar_grupo escribe y devuelve el grupo releido', async () => {
  seed('m-mat', { usuarios: 4000 });
  seed('m-sat', { usuarios: 800 });
  const cliente = await conectar();

  const r = leer(
    await cliente.callTool({
      name: 'marcar_grupo',
      arguments: { idEmpresa: 'm-sat', idMatriz: 'm-mat', fuente: 'RUES', quien: QUIEN, nota: 'mismo rep legal' },
    }),
  );

  assert.equal(r.cambio, true);
  assert.equal(r.matrizDespues, 'm-mat');
  assert.deepEqual(r.grupo.matriz, { idEmpresa: 'm-mat', nombre: 'NOMBRE m-mat' });
  assert.deepEqual(
    r.grupo.integrantes.map((i: { idEmpresa: string }) => i.idEmpresa),
    ['m-mat', 'm-sat'],
  );
  assert.equal(r.grupo.usuariosEfectivosGrupo, 4800);
});

test('marcar_grupo con cadena responde error explicito y no escribe', async () => {
  seed('x-raiz');
  seed('x-medio', { matriz: 'x-raiz' });
  seed('x-hoja');
  const cliente = await conectar();

  const res = (await cliente.callTool({
    name: 'marcar_grupo',
    arguments: { idEmpresa: 'x-hoja', idMatriz: 'x-medio', fuente: 'RUES', quien: QUIEN },
  })) as Respuesta;

  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /una matriz no puede tener matriz/);
  const db = new Database(dbPath);
  const fila = db.prepare(`SELECT id_empresa_matriz AS m FROM empresa WHERE id_empresa = 'x-hoja'`).get() as { m: string | null };
  db.close();
  assert.equal(fila.m, null);
});

test('cuentas trae idEmpresaMatriz en cada fila y no colapsa el grupo', async () => {
  const cliente = await conectar(false);
  const cuerpo = leer(await cliente.callTool({ name: 'cuentas', arguments: {} }));
  const sat = cuerpo.cuentas.find((c: { idEmpresa: string }) => c.idEmpresa === 'm-sat');
  const mat = cuerpo.cuentas.find((c: { idEmpresa: string }) => c.idEmpresa === 'm-mat');
  assert.equal(sat.idEmpresaMatriz, 'm-mat');
  assert.equal(mat.idEmpresaMatriz, null);
});

test('cobertura_geografica agrupa por matriz por default y suma el grupo', async () => {
  seed('c-mat', { usuarios: 3000, accesos: 100 });
  seed('c-sat', { matriz: 'c-mat', usuarios: 2000, accesos: 900 });
  seed('c-suelta', { usuarios: 500, accesos: 700 });
  const cliente = await conectar(false);

  const r = leer(await cliente.callTool({ name: 'cobertura_geografica', arguments: { municipio: 'Pasto' } }));

  assert.equal(r.filtros.agruparPorMatriz, true);
  assert.equal(r.agrupadoPorMatriz, true);
  assert.equal(r.totalEmpresas, 3);
  assert.equal(r.total, 2, 'dos grupos: c-mat con su satelite, y c-suelta');
  assert.deepEqual(
    r.empresas.map((e: { idEmpresa: string }) => e.idEmpresa),
    ['c-mat', 'c-suelta'],
    'el grupo pesa 1000 accesos y va primero; la fila es la matriz',
  );
  const g = r.empresas[0].grupo;
  assert.equal(g.idGrupo, 'c-mat');
  assert.equal(g.accesosZonaGrupo, 1000);
  assert.equal(g.usuariosEfectivosGrupo, 5000);
  assert.deepEqual(g.integrantesEnZona.sort(), ['c-mat', 'c-sat']);
  assert.equal(r.empresas[1].grupo, null, 'una cuenta sin grupo no trae grupo');
});

test('cobertura_geografica con agruparPorMatriz:false devuelve una fila por empresa', async () => {
  const cliente = await conectar(false);
  const r = leer(await cliente.callTool({ name: 'cobertura_geografica', arguments: { municipio: 'Pasto', agruparPorMatriz: false } }));
  assert.equal(r.agrupadoPorMatriz, false);
  assert.deepEqual(
    r.empresas.map((e: { idEmpresa: string }) => e.idEmpresa),
    ['c-sat', 'c-suelta', 'c-mat'],
  );
  const sat = r.empresas.find((e: { idEmpresa: string }) => e.idEmpresa === 'c-sat');
  assert.equal(sat.idEmpresaMatriz, 'c-mat');
  assert.equal(sat.grupo.idGrupo, 'c-mat');
});

test('marcar_aliado devuelve la clasificacion interna y la categoria de la vista releidas', async () => {
  seed('al-sae');
  const db = new Database(dbPath);
  db.prepare(`INSERT INTO empresa_clasificacion (id_empresa, alianza_sae_plus) VALUES ('al-sae', 1)`).run();
  db.close();
  const cliente = await conectar();

  const r = leer(
    await cliente.callTool({
      name: 'marcar_aliado',
      arguments: { idEmpresa: 'al-sae', aliado: 'ninguno_verificado', fuente: 'llamada', quien: QUIEN },
    }),
  );

  assert.equal(r.clasificacion.aliado, 'ninguno_verificado');
  assert.equal(r.clasificacionInterna.alianzaSaePlus, false);
  assert.equal(r.clasificacionInterna.tocada, true);
  assert.equal(r.categoria, 'isp');
});
