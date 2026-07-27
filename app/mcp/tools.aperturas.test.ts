// aperturas_whatsapp (lectura, 2026-07-26) + accionCliente en las tres tools que escriben un
// toque. Las dos mitades del mismo pedido: capturar el dato ya estaba hecho en el dominio, pero
// sin superficie del MCP no lo puede escribir ni leer nadie, porque el operador registra
// dictandole al brain y nadie escribe en la web de la herramienta.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { aperturasWhatsappTool, registrarToqueTool, editarToqueTool, marcarPerdidaTool } = await import('./tools.ts');
const { crearMcpServer, TOOLS_LECTURA, TOOLS_ESCRITURA } = await import('./server.ts');
const { guardarMensajeSaliente, guardarMensajeEntrante } = await import('../db/repository.ts');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

function raw() {
  return new Database(dbPath);
}

function seedEmpresa(id: string, nombre: string, telefono: string) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'activo', 'contacto_iniciado', 1)`,
  ).run(id, nombre, nombre.toLowerCase());
  db.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, telefono, fuente)
     VALUES (?, 'Contacto', 0, 1, ?, 'seed')`,
  ).run(id, telefono);
  const c = db.prepare(`SELECT id_contacto FROM contacto WHERE id_empresa = ?`).get(id) as { id_contacto: number };
  db.close();
  return c.id_contacto;
}

const anaId = seedEmpresa('ap-mcp-1', 'Fibra Uno', '573000000011');
const caroId = seedEmpresa('ap-mcp-2', 'Fibra Dos', '573000000022');

guardarMensajeSaliente(
  { referenciaProveedor: 'l1', telefono: '573000000011', texto: 'Hola, vi que cobran por PSE', mensajeId: 'ap-1', fecha: '2026-07-27T09:00:00.000Z' },
  anaId,
);
guardarMensajeEntrante(
  { referenciaProveedor: 'l1', telefono: '573000000011', texto: 'Si, cuentame', mensajeId: 'ap-1-r', fecha: '2026-07-27T10:00:00.000Z' },
  anaId,
);
guardarMensajeSaliente(
  { referenciaProveedor: 'l1', telefono: '573000000022', texto: 'Hola, les ayudo con el recaudo', mensajeId: 'ap-2', fecha: '2026-07-28T09:00:00.000Z' },
  caroId,
);

test('aperturas_whatsapp devuelve el copy con su cuenta y si contestaron', () => {
  const r = aperturasWhatsappTool();
  assert.equal(r.total, 2);
  assert.equal(r.conRespuesta, 1);
  assert.equal(r.sinRespuesta, 1);
  assert.equal(r.truncado, false);

  const uno = r.aperturas.find((a) => a.empresa === 'Fibra Uno')!;
  assert.equal(uno.texto, 'Hola, vi que cobran por PSE');
  assert.equal(uno.respondio, true);
  assert.equal(uno.fechaRespuesta, '2026-07-27T10:00:00.000Z');

  const dos = r.aperturas.find((a) => a.empresa === 'Fibra Dos')!;
  assert.equal(dos.respondio, false);
  assert.equal(dos.fechaRespuesta, null);
});

// El caso concreto que motivo la tool: los mensajes de UN dia, para sacar el patron de ese lote.
test('aperturas_whatsapp filtra por dia', () => {
  const soloLunes = aperturasWhatsappTool({ desde: '2026-07-27', hasta: '2026-07-27' });
  assert.equal(soloLunes.total, 1);
  assert.equal(soloLunes.aperturas[0].empresa, 'Fibra Uno');
});

test('aperturas_whatsapp se publica como tool de LECTURA, no de escritura', async () => {
  assert.ok(TOOLS_LECTURA.includes('aperturas_whatsapp'));
  assert.ok(!(TOOLS_ESCRITURA as readonly string[]).includes('aperturas_whatsapp'));

  const [aCliente, aServidor] = InMemoryTransport.createLinkedPair();
  const server = crearMcpServer();
  const cliente = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(aServidor), cliente.connect(aCliente)]);

  const { tools } = await cliente.listTools();
  assert.ok(tools.some((t) => t.name === 'aperturas_whatsapp'), 'un lector la ve sin permiso de escritura');
  await cliente.close();
});

// La escala de compromiso, escribible desde las tres tools que tocan un toque. Sin esto la
// columna existe y no la puede llenar nadie: el operador registra dictandole al brain, que
// escribe por MCP.
test('registrar_toque acepta accionCliente y lo deja escrito', () => {
  const r = registrarToqueTool(
    { idEmpresa: 'ap-mcp-1', canal: 'llamada', resultado: 'contesto_sigue_seguimiento', quePaso: 'conto su stack', accionCliente: 'revela_informacion' },
    1,
  );
  assert.equal(r.toque.accionCliente, 'revela_informacion', 'y vuelve en el toque releido, no en un ok');
});

test('editar_toque corrige la accion y puede borrarla', () => {
  const r = registrarToqueTool(
    { idEmpresa: 'ap-mcp-1', canal: 'llamada', resultado: 'contesto_sigue_seguimiento', quePaso: 'segundo', accionCliente: 'concede_atencion' },
    1,
  );
  const editado = editarToqueTool({ idToque: r.toque.idToque, motivo: 'lo confirmo despues en la reunion', accionCliente: 'negocia' }, 1);
  assert.equal(editado.toque.accionCliente, 'negocia');

  const borrado = editarToqueTool({ idToque: r.toque.idToque, motivo: 'lo puse por error', accionCliente: null }, 1);
  assert.equal(borrado.toque.accionCliente, null);
});

test('marcar_perdida acepta el nivel al que llego la cuenta antes de caerse', () => {
  const r = marcarPerdidaTool(
    { idEmpresa: 'ap-mcp-2', canal: 'llamada', razonPerdida: 'precio', quePaso: 'se cayo negociando', accionCliente: 'negocia' },
    1,
  );
  assert.equal(r.toque.accionCliente, 'negocia');
});

// Vocabulario cerrado tambien en la superficie: el dominio rechaza, no solo el schema del MCP.
test('una accion fuera de la escala no pasa por la tool', () => {
  assert.throws(() =>
    registrarToqueTool(
      { idEmpresa: 'ap-mcp-1', canal: 'llamada', resultado: 'no_contesto', quePaso: 'x', accionCliente: 'super_interesado' as never },
      1,
    ),
  );
});
