// El contrato del MCP para tipo_toque. Existe aparte de las pruebas de dominio porque el
// dominio puede saber guardar un campo que la tool no deja mandar: el inputSchema de
// registerTool parsea con Zod, y una llave que no este declarada ahi se cae en silencio antes de
// llegar al repositorio. Eso es exactamente lo que le paso a las tres columnas de transcript, que
// vivieron meses en la tabla sin un camino de escritura que las llenara.
//
// Por eso estas pruebas van por el Client real del SDK y no llamando la funcion wrapper: lo que
// se esta verificando es lo que puede mandar quien esta del otro lado del protocolo.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { crearMcpServer } = await import('./server.ts');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

test.after(() => borrarDbPrueba(dbPath));

function seedEmpresa(id: string) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id)
       VALUES (?, 'nit', ?, ?, 'activo', 'contacto_iniciado', 1)`,
    )
    .run(id, id, id);
  raw.close();
}

function tipoDe(idEmpresa: string): string | null {
  const raw = new Database(dbPath);
  const fila = raw.prepare('SELECT tipo_toque FROM toque WHERE id_empresa = ? ORDER BY id_toque DESC LIMIT 1').get(idEmpresa) as
    | { tipo_toque: string | null }
    | undefined;
  raw.close();
  return fila?.tipo_toque ?? null;
}

async function conectar() {
  const servidor = crearMcpServer({ escritura: true });
  const cliente = new Client({ name: 'prueba-tipo-toque', version: '1.0.0' });
  const [t1, t2] = InMemoryTransport.createLinkedPair();
  await Promise.all([servidor.connect(t2), cliente.connect(t1)]);
  return cliente;
}

test('registrar_toque acepta tipoToque y lo deja escrito', async () => {
  seedEmpresa('mcp-tt-1');
  const cliente = await conectar();

  await cliente.callTool({
    name: 'registrar_toque',
    arguments: { idEmpresa: 'mcp-tt-1', canal: 'llamada', resultado: 'no_contesto', quePaso: 'primera marcada', tipoToque: 'frio' },
  });

  assert.equal(tipoDe('mcp-tt-1'), 'frio');
});

// El vocabulario tiene que viajar en el contrato, no solo vivir en el codigo: es lo que lee
// quien llama para saber que puede mandar sin adivinar.
test('el inputSchema publica los cinco valores del vocabulario', async () => {
  const cliente = await conectar();
  const { tools } = await cliente.listTools();

  const registrar = tools.find((t) => t.name === 'registrar_toque');
  const propiedad = (registrar?.inputSchema as { properties?: Record<string, unknown> }).properties?.tipoToque as
    | { enum?: string[] }
    | undefined;

  assert.deepEqual(propiedad?.enum, ['frio', 'reactivacion', 'seguimiento', 'reunion', 'cierre']);
});

test('editar_toque corrige el tipo de un toque ya escrito', async () => {
  seedEmpresa('mcp-tt-2');
  const cliente = await conectar();

  const creado = await cliente.callTool({
    name: 'registrar_toque',
    arguments: { idEmpresa: 'mcp-tt-2', canal: 'llamada', resultado: 'no_contesto', quePaso: 'marcada', tipoToque: 'seguimiento' },
  });
  const idToque = JSON.parse((creado.content as { text: string }[])[0].text).toque.idToque as number;

  await cliente.callTool({
    name: 'editar_toque',
    arguments: { idToque, motivo: 'la cuenta llevaba tres meses quieta, fue reactivacion', tipoToque: 'reactivacion' },
  });

  assert.equal(tipoDe('mcp-tt-2'), 'reactivacion');
});

test('marcar_perdida acepta el tipo del toque en el que se cayo la cuenta', async () => {
  seedEmpresa('mcp-tt-3');
  const cliente = await conectar();

  await cliente.callTool({
    name: 'marcar_perdida',
    arguments: { idEmpresa: 'mcp-tt-3', canal: 'llamada', razonPerdida: 'precio', quePaso: 'no paso del precio', tipoToque: 'cierre' },
  });

  assert.equal(tipoDe('mcp-tt-3'), 'cierre');
});
