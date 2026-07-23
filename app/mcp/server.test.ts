// Prueba de extremo a extremo del MCP server: HTTP real (puerto efimero), auth por token
// y las 3 tools de punta a punta con el Client oficial del SDK (no un fetch a mano
// simulando el protocolo -- si el wire format cambia entre versiones del SDK, este test
// se entera). El 401 SI se prueba con fetch plano: es una respuesta HTTP simple, antes de
// que el protocolo MCP entre en juego.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;
process.env.MCP_TOKEN = 'secreto-de-prueba';

const { crearServidorMcp } = await import('./server.ts');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');

function seedEmpresa(id: string, estado: string, idOrganizacion: number) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id, notion_page_id)
       VALUES (?, 'nit', ?, ?, 'activo', ?, ?, ?)`,
    )
    .run(id, id, id, estado, idOrganizacion, `ntn-${id}`);
  raw.close();
}

const servidor = crearServidorMcp();
let baseUrl = '';

test.before(async () => {
  await new Promise<void>((resolve) => servidor.listen(0, resolve));
  const address = servidor.address();
  if (address === null || typeof address === 'string') throw new Error('no se pudo obtener el puerto efimero');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
  borrarDbPrueba(dbPath);
});

test('GET /health responde 200 sin exigir token', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('POST /mcp sin Authorization: 401', async () => {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  assert.equal(res.status, 401);
});

test('POST /mcp con token invalido: 401', async () => {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer no-es-el-secreto' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  assert.equal(res.status, 401);
});

test('POST /mcp con el token correcto en X-MCP-Token (no solo Authorization): pasa el gate', async () => {
  // No es una request MCP valida (falta el handshake initialize), pero el punto de este
  // test es el AUTH: si el token fuera rechazado, saldria 401 antes de llegar al
  // protocolo. Cualquier otra cosa (incluido un error de protocolo) prueba que el gate
  // de token se paso.
  const res = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mcp-token': 'secreto-de-prueba' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  assert.notEqual(res.status, 401);
});

test('GET /mcp: 405 (modo stateless, no hay sesion que reabrir)', async () => {
  const res = await fetch(`${baseUrl}/mcp`, { method: 'GET', headers: { authorization: 'Bearer secreto-de-prueba' } });
  assert.equal(res.status, 405);
});

test('cliente MCP real: handshake + tools/list expone las 3 tools de solo lectura', async () => {
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: { headers: { Authorization: 'Bearer secreto-de-prueba' } },
  });
  await client.connect(transport);

  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    ['deal_historia', 'panel_metricas', 'pipeline'],
  );

  await client.close();
});

test('cliente MCP real: tools/call de "pipeline" devuelve JSON con la forma esperada', async () => {
  const ORG = 9001;
  seedEmpresa('e2e1', 'oportunidad', ORG);

  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: { headers: { Authorization: 'Bearer secreto-de-prueba' } },
  });
  await client.connect(transport);

  const resultado = await client.callTool({ name: 'pipeline', arguments: { idOrganizacion: ORG } });
  const contenido = resultado.content as Array<{ type: string; text: string }>;
  assert.equal(contenido[0].type, 'text');
  const parsed = JSON.parse(contenido[0].text);
  assert.equal(parsed.organizacion, ORG);
  assert.equal(parsed.empresas.length, 1);
  assert.equal(parsed.empresas[0].idEmpresa, 'e2e1');
  assert.equal(parsed.empresas[0].etapa, 'oportunidad');

  await client.close();
});

test('cliente MCP real: tools/call de "deal_historia" para una empresa inexistente devuelve el error explicito, no truena', async () => {
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: { headers: { Authorization: 'Bearer secreto-de-prueba' } },
  });
  await client.connect(transport);

  const resultado = await client.callTool({ name: 'deal_historia', arguments: { idEmpresa: 'no-existe-9002', idOrganizacion: 9002 } });
  const contenido = resultado.content as Array<{ type: string; text: string }>;
  const parsed = JSON.parse(contenido[0].text);
  assert.deepEqual(parsed, { idEmpresa: 'no-existe-9002', error: 'empresa_no_encontrada' });

  await client.close();
});
