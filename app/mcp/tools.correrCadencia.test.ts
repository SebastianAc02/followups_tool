// correr_cadencia (ESCRITURA, 2026-08-03): el movimiento en bloque que pidio el operador el
// mismo dia que su cola abrio con 43 pasos vencidos de cuentas en hold. Corre un pedazo de la
// cadencia N dias sin bajar la cuenta de la secuencia y sin que cuente como paso incumplido.
//
// Este archivo prueba la capa MCP: el gate (escribe produccion, asi que no puede listarse sin
// permiso de escritura) y el camino de punta a punta por el protocolo, que es lo unico que
// demuestra que el inputSchema declarado acepta la llamada que el brain va a hacer. Los
// invariantes de dominio viven en repository.correrCadencia.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { crearMcpServer, TOOLS_LECTURA, TOOLS_ESCRITURA } = await import('./server.ts');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

const ORG = 1;

test.after(() => borrarDbPrueba(dbPath));

function seedCuentaConPasoVencido(idEmpresa: string) {
  const db = new Database(dbPath);
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, owner, organizacion_activa_id)
     VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', 'Sebastian Acosta Molina', ?)`,
  ).run(idEmpresa, idEmpresa, idEmpresa, ORG);
  const idCad = Number(db.prepare(`INSERT INTO cadencia (nombre) VALUES ('Precio ISPs B')`).run().lastInsertRowid);
  const idPaso = Number(
    db.prepare(`INSERT INTO paso_cadencia (id_cadencia, orden, dia_offset, canal) VALUES (?, 1, 0, 'llamada')`).run(idCad).lastInsertRowid,
  );
  const idVersion = Number(db.prepare(`INSERT INTO version_paso (id_paso, cuerpo) VALUES (?, 'hola')`).run(idPaso).lastInsertRowid);
  const idSeg = Number(db.prepare(`INSERT INTO segmento (nombre, definicion) VALUES ('Seg', '{}')`).run().lastInsertRowid);
  const idCampana = Number(
    db
      .prepare(`INSERT INTO campana (nombre, id_cadencia, id_segmento, estado, id_organizacion) VALUES ('Precio ISPs B', ?, ?, 'activa', ?)`)
      .run(idCad, idSeg, ORG).lastInsertRowid,
  );
  const idContacto = Number(
    db.prepare(`INSERT INTO contacto (id_empresa, nombre, es_principal, email, fuente) VALUES (?, 'KDM', 1, ?, 'cockpit')`).run(
      idEmpresa,
      `kdm@${idEmpresa}.test`,
    ).lastInsertRowid,
  );
  const idInscripcion = Number(
    db
      .prepare(`INSERT INTO inscripcion (id_campana, id_empresa, estado, paso_actual, fecha_inscripcion) VALUES (?, ?, 'activa', 1, '2026-07-20')`)
      .run(idCampana, idEmpresa).lastInsertRowid,
  );
  const idDest = Number(
    db.prepare(`INSERT INTO destinatario (id_inscripcion, id_contacto, estado) VALUES (?, ?, 'activo')`).run(idInscripcion, idContacto)
      .lastInsertRowid,
  );
  const idPasoIns = Number(
    db
      .prepare(
        `INSERT INTO paso_inscripcion (id_destinatario, id_paso, id_version, canal, estado, fecha_programada) VALUES (?, ?, ?, 'llamada', 'pendiente', '2026-07-28')`,
      )
      .run(idDest, idPaso, idVersion).lastInsertRowid,
  );
  db.close();
  return { idPasoIns };
}

async function toolsDe(server: ReturnType<typeof crearMcpServer>) {
  const [c, s] = InMemoryTransport.createLinkedPair();
  const cliente = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(s), cliente.connect(c)]);
  const { tools } = await cliente.listTools();
  await cliente.close();
  return tools.map((t: { name: string }) => t.name);
}

test('correr_cadencia esta en TOOLS_ESCRITURA y NUNCA en lectura: escribe produccion', () => {
  assert.ok((TOOLS_ESCRITURA as readonly string[]).includes('correr_cadencia'));
  assert.ok(!(TOOLS_LECTURA as readonly string[]).includes('correr_cadencia'));
});

test('sin permiso de escritura no se lista; con permiso si', async () => {
  assert.equal((await toolsDe(crearMcpServer())).includes('correr_cadencia'), false);
  assert.ok((await toolsDe(crearMcpServer({ escritura: true, idOrganizacion: ORG }))).includes('correr_cadencia'));
});

test('tools/call corre el paso vencido y devuelve donde quedo, releido', async () => {
  const { idPasoIns } = seedCuentaConPasoVencido('mcp-correr');
  const [c, s] = InMemoryTransport.createLinkedPair();
  const cliente = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([crearMcpServer({ escritura: true, idOrganizacion: ORG }).connect(s), cliente.connect(c)]);

  const r = (await cliente.callTool({
    name: 'correr_cadencia',
    arguments: { idsEmpresa: ['mcp-correr'], dias: 7, hasta: '2026-08-03', motivo: 'sigue en hold' },
  })) as { content: { text: string }[] };
  await cliente.close();

  const json = JSON.parse(r.content[0].text);
  assert.equal(json.cuentaComoIncumplimiento, false);
  assert.equal(json.pasosCorridos, 1);
  assert.deepEqual(json.cuentas[0].pasosCorridos[0].fechaAhora, '2026-08-04');

  const db = new Database(dbPath);
  const fila = db.prepare(`SELECT fecha_programada f, estado FROM paso_inscripcion WHERE id_paso_inscripcion = ?`).get(idPasoIns) as {
    f: string;
    estado: string;
  };
  db.close();
  assert.equal(fila.f, '2026-08-04', 'quedo escrito en produccion, no solo en la respuesta');
  assert.equal(fila.estado, 'pendiente', 'el paso sigue vivo: correr no es incumplir');
});
