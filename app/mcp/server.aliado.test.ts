// El contrato del MCP para aliado: la accion que lo escribe y la lista que lo devuelve con su
// evidencia. Va por el Client real del SDK porque un campo puede existir en el dominio y seguir
// sin poder mandarse desde afuera: el inputSchema de registerTool parsea con Zod y bota en
// silencio las llaves que no declaro. Ya paso en esta misma rama con tipoToque.
//
// La prueba que de verdad importa es la ultima: que la lista con la que se decide a quien llamar
// traiga las cuentas sin verificar MARCADAS. Sin eso, esta columna solo mueve el error de sitio.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { crearMcpServer } = await import('./server.ts');
const { ADVERTENCIA_SIN_VERIFICAR } = await import('../db/validation.ts');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

test.after(() => borrarDbPrueba(dbPath));

function seedEmpresa(id: string) {
  const db = new Database(dbPath);
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                          estado_notion, organizacion_activa_id, notion_page_id)
     VALUES (?, 'nit', ?, ?, 'activo', 'contacto_iniciado', 1, ?)`,
  ).run(id, id, id, `ntn-${id}`);
  db.close();
}

async function conectar() {
  const servidor = crearMcpServer({ escritura: true });
  const cliente = new Client({ name: 'prueba-aliado', version: '1.0.0' });
  const [t1, t2] = InMemoryTransport.createLinkedPair();
  await Promise.all([servidor.connect(t2), cliente.connect(t1)]);
  return cliente;
}

function leer(res: unknown) {
  return JSON.parse(((res as { content: { text: string }[] }).content)[0].text);
}

test('marcar_aliado escribe y devuelve la clasificacion releida con su procedencia', async () => {
  seedEmpresa('mcp-al-jasz');
  const cliente = await conectar();

  const res = await cliente.callTool({
    name: 'marcar_aliado',
    arguments: {
      idEmpresa: 'mcp-al-jasz',
      aliado: 'ultimo_kilometro',
      fuente: 'operador',
      quien: 'Sebastian Acosta Molina',
      nota: 'lo dijo en la sesion, Notion no lo tenia',
    },
  });

  const c = leer(res).clasificacion;
  assert.equal(c.aliado, 'ultimo_kilometro');
  assert.equal(c.verificado, true);
  assert.equal(c.advertencia, null);
  assert.equal(c.evidencia.quien, 'Sebastian Acosta Molina');
  assert.equal(c.evidencia.fuente, 'operador');
});

test('el inputSchema publica los cinco valores y exige fuente y quien', async () => {
  const cliente = await conectar();
  const { tools } = await cliente.listTools();

  const marcar = tools.find((t) => t.name === 'marcar_aliado');
  const esquema = marcar?.inputSchema as { properties?: Record<string, { enum?: string[] }>; required?: string[] };

  assert.deepEqual(esquema.properties?.aliado?.enum, [
    'sae_plus',
    'ultimo_kilometro',
    'integrapay',
    'ninguno_verificado',
    'sin_verificar',
  ]);
  assert.ok(esquema.required?.includes('fuente'), 'sin fuente el dato no se puede auditar');
  assert.ok(esquema.required?.includes('quien'), 'sin quien lo dijo el dato no se puede auditar');
});

// El fallo del 4-ago, en la capa donde ocurrio: la lista con la que se decide a quien llamar.
// Fiesta y Tunortetv salieron como limpias porque su campo estaba vacio.
test('la lista devuelve las cuentas sin verificar MARCADAS, no como limpias', async () => {
  seedEmpresa('mcp-al-fiesta');
  const cliente = await conectar();

  const res = await cliente.callTool({ name: 'cuentas', arguments: { conAliado: true } });
  const fila = leer(res).cuentas.find((c: { idEmpresa: string }) => c.idEmpresa === 'mcp-al-fiesta');

  assert.equal(fila.aliado.aliado, 'sin_verificar');
  assert.equal(fila.aliado.verificado, false);
  assert.equal(fila.aliado.advertencia, ADVERTENCIA_SIN_VERIFICAR);
});

// El conteo que hace visible el tamano del hueco sin tener que recorrer 476 filas a mano.
test('la lista dice cuantas cuentas nadie ha verificado', async () => {
  const cliente = await conectar();
  const res = await cliente.callTool({ name: 'cuentas', arguments: { conAliado: true } });
  const cuerpo = leer(res);

  assert.equal(typeof cuerpo.sinVerificarAliado, 'number');
  assert.ok(cuerpo.sinVerificarAliado >= 1, 'mcp-al-fiesta no ha sido verificada');
});

// `cuentas` nacio como la lista MINIMA para cruzar contra Notion (seis campos, contra los 142 KB
// de pipeline). Ese proposito no se pisa: la clasificacion se pide, no viene de oficio.
test('sin pedirlo, la lista sigue siendo la minima de reconciliacion', async () => {
  const cliente = await conectar();
  const res = await cliente.callTool({ name: 'cuentas', arguments: {} });
  const cuerpo = leer(res);

  assert.equal(cuerpo.cuentas[0].aliado, undefined);
  assert.equal(cuerpo.sinVerificarAliado, undefined);
});
