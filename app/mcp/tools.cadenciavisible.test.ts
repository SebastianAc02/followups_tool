// estado_cadencia (LECTURA) y sacar_de_cadencia (ESCRITURA), 2026-08-03. Las dos acciones que
// el brain necesito el mismo dia y no existian: ver la cadencia de un lead, y bajarlo de la
// cola sin que cuente como un paso incumplido.
//
// Este archivo prueba la capa MCP: que las tools compongan bien contra el dominio, y sobre
// todo que el GATE las clasifique donde va cada una -- estado_cadencia lee y tiene que verla
// un lector sin permiso de escritura; sacar_de_cadencia escribe produccion y no puede
// aparecer sin ese permiso. Los invariantes de dominio (no escribe aplazo, cancela envios,
// rechaza sin descartar) viven en repository.sacarDeCadencia.test.ts.
//
// Mismo patron que tools.write.test.ts: DB de archivo, ISPS_DB_PATH fijado ANTES del import
// dinamico, siembra y relectura con better-sqlite3 crudo.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { estadoCadenciaTool, sacarDeCadenciaTool } = await import('./tools.ts');
const { crearMcpServer, TOOLS_LECTURA, TOOLS_ESCRITURA } = await import('./server.ts');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

const ORG = 1;

function seedEmpresa(id: string, opts: { estado?: string; owner?: string | null; fecha?: string | null } = {}) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial,
                            estado_notion, owner, proximo_follow_up_fecha, organizacion_activa_id)
       VALUES (?, 'nit', ?, ?, 'activo', ?, ?, ?, ?)`,
    )
    .run(id, id, id, opts.estado ?? 'lead', opts.owner ?? null, opts.fecha ?? null, ORG);
  raw.close();
}

test.after(() => borrarDbPrueba(dbPath));

// EL CASO MEDIDO el 2026-08-03: 9 cuentas en 'lead' con owner, sin un solo toque, que `cola`
// no muestra y que hasta hoy no habia por donde mirar.
test('estado_cadencia devuelve los lead de un owner con su fecha, que es lo que `cola` esconde', () => {
  seedEmpresa('cv-1', { owner: 'Sebastian Acosta Molina', fecha: '2026-07-01' });
  seedEmpresa('cv-2', { owner: 'Sebastian Acosta Molina', fecha: '2026-06-15' });
  seedEmpresa('cv-otro', { owner: 'Felipe Castro', fecha: '2026-07-01' });

  const r = estadoCadenciaTool({ owner: 'Sebastian Acosta Molina', estado: 'lead' });
  assert.deepEqual(r.cuentas.map((c) => c.idEmpresa).sort(), ['cv-1', 'cv-2']);
  assert.equal(r.cuentas.find((c) => c.idEmpresa === 'cv-2')!.proximoFollowUpFecha, '2026-06-15');
  assert.equal(r.total, 2);
  assert.equal(r.conCadenciaActiva, 0);
  assert.equal(r.sinNingunaInscripcion, 2);
});

test('estado_cadencia resuelve la organizacion por default como el resto de las lecturas', () => {
  const r = estadoCadenciaTool({ idEmpresa: 'cv-1' });
  assert.equal(r.organizacion, ORG);
  assert.equal(r.filtro.idEmpresa, 'cv-1');
});

// Lo que la tool tiene prohibido: contestar "no tiene cadencia" cuando la verdad es "no esta
// en la base". Quien actue sobre esa respuesta inscribe una cuenta que no existe.
test('estado_cadencia sobre una cuenta inexistente FALLA en vez de devolver vacio', () => {
  assert.throws(() => estadoCadenciaTool({ idEmpresa: 'cv-fantasma' }), /no existe en la organizacion/);
});

test('sacar_de_cadencia deja la fecha en NULL y devuelve la cuenta RELEIDA, no un ok', () => {
  seedEmpresa('cv-sacar', { owner: 'Sebastian Acosta Molina', fecha: '2026-07-01' });
  const r = sacarDeCadenciaTool({ idsEmpresa: ['cv-sacar'], limpiarFecha: true, motivo: 'todavia no esta para toque' }, ORG);

  const raw = new Database(dbPath);
  const e = raw.prepare(`SELECT proximo_follow_up_fecha FROM empresa WHERE id_empresa = 'cv-sacar'`).get() as any;
  raw.close();
  assert.equal(e.proximo_follow_up_fecha, null);
  assert.equal(r.cuentas[0].empresa.proximoFollowUpFecha, null);
  assert.equal(r.cuentas[0].cadenciaDespues.proximoFollowUpFecha, null);
  assert.equal(r.cuentaComoIncumplimiento, false);
});

test('sacar_de_cadencia no deja rastro en seguimiento_aplazado: no es un aplazo', () => {
  const raw = new Database(dbPath);
  const n = raw.prepare(`SELECT count(*) AS n FROM seguimiento_aplazado WHERE id_empresa = 'cv-sacar'`).get() as any;
  raw.close();
  assert.equal(n.n, 0);
});

// El guard de organizacion no lo fija el cliente sino la sesion. Aca se prueba que la tool lo
// respeta: una cuenta de otra organizacion se rechaza con su motivo y no se escribe.
test('sacar_de_cadencia respeta el guard de organizacion y lo reporta como rechazo', () => {
  seedEmpresa('cv-org', { fecha: '2026-07-01' });
  const r = sacarDeCadenciaTool({ idsEmpresa: ['cv-org'], limpiarFecha: true }, 999);
  assert.equal(r.aplicadas, 0);
  assert.equal(r.rechazos[0].motivo, 'otra_organizacion');

  const raw = new Database(dbPath);
  const e = raw.prepare(`SELECT proximo_follow_up_fecha FROM empresa WHERE id_empresa = 'cv-org'`).get() as any;
  raw.close();
  assert.equal(e.proximo_follow_up_fecha, '2026-07-01', 'no se escribio nada');
});

async function toolsDe(server: any): Promise<string[]> {
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(c);
  const { tools } = await client.listTools();
  await client.close();
  return tools.map((t: any) => t.name).sort();
}

// El cast existe porque las constantes son unions de literales y TS rechaza comparar contra
// un string suelto. La garantia que interesa es la del gate, no la del tipo.
test('estado_cadencia esta en TOOLS_LECTURA: un lector sin escritura tiene que poder mirar', () => {
  assert.ok((TOOLS_LECTURA as readonly string[]).includes('estado_cadencia'));
  assert.ok(!(TOOLS_ESCRITURA as readonly string[]).includes('estado_cadencia'));
});

test('sacar_de_cadencia esta en TOOLS_ESCRITURA y NUNCA en lectura: escribe produccion', () => {
  assert.ok((TOOLS_ESCRITURA as readonly string[]).includes('sacar_de_cadencia'));
  assert.ok(!(TOOLS_LECTURA as readonly string[]).includes('sacar_de_cadencia'));
});

test('sin el permiso de escritura, estado_cadencia SI se lista y sacar_de_cadencia NO', async () => {
  const nombres = await toolsDe(crearMcpServer());
  assert.ok(nombres.includes('estado_cadencia'));
  assert.equal(nombres.includes('sacar_de_cadencia'), false);
});

test('con el permiso de escritura se listan las dos', async () => {
  const nombres = await toolsDe(crearMcpServer({ escritura: true, idOrganizacion: ORG }));
  assert.ok(nombres.includes('estado_cadencia'));
  assert.ok(nombres.includes('sacar_de_cadencia'));
});

// De punta a punta por el protocolo, con el cliente real: es lo que prueba que el inputSchema
// declarado en server.ts acepta la llamada que el brain va a hacer de verdad.
test('tools/call de estado_cadencia por el protocolo devuelve el JSON esperado', async () => {
  const [c, s] = InMemoryTransport.createLinkedPair();
  await crearMcpServer().connect(s);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(c);

  const resultado = await client.callTool({ name: 'estado_cadencia', arguments: { owner: 'Sebastian Acosta Molina', estado: 'lead' } });
  const contenido = resultado.content as Array<{ type: string; text: string }>;
  const parsed = JSON.parse(contenido[0].text);
  assert.equal(parsed.organizacion, ORG);
  assert.ok(parsed.cuentas.some((x: any) => x.idEmpresa === 'cv-1'));

  await client.close();
});

test('tools/call de sacar_de_cadencia por el protocolo escribe y devuelve lo escrito', async () => {
  seedEmpresa('cv-e2e', { owner: 'Sebastian Acosta Molina', fecha: '2026-07-01' });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await crearMcpServer({ escritura: true, idOrganizacion: ORG }).connect(s);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(c);

  const resultado = await client.callTool({
    name: 'sacar_de_cadencia',
    arguments: { idsEmpresa: ['cv-e2e'], limpiarFecha: true, pausarInscripciones: true },
  });
  const contenido = resultado.content as Array<{ type: string; text: string }>;
  const parsed = JSON.parse(contenido[0].text);
  assert.equal(parsed.aplicadas, 1);
  assert.equal(parsed.rechazadas, 0);
  assert.equal(parsed.cuentaComoIncumplimiento, false);
  assert.equal(parsed.cuentas[0].empresa.proximoFollowUpFecha, null);

  await client.close();
});
