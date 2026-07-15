// Verifica que registrarToque y escribirTranscriptCompleto encolan en outbox SOLO
// cuando la empresa ya tiene notion_page_id (V3.7), y que outboxPendientes/marcarOutbox*
// funcionan como espera app/core/outbox.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba } from './test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const { registrarToque, escribirTranscriptCompleto, outboxPendientes, marcarOutboxEnviado, marcarOutboxFallido } = await import(
  './repository.ts'
);

function seedEmpresa(idEmpresa: string, notionPageId: string | null) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, notion_page_id)
       VALUES (?, 'nit', 'Empresa Test', 'empresa test', 'lead', ?)`,
    )
    .run(idEmpresa, notionPageId);
  raw.close();
}

test('registrarToque encola outbox cuando la empresa tiene notion_page_id', () => {
  seedEmpresa('emp-con-notion', 'page-abc');
  registrarToque({ idEmpresa: 'emp-con-notion', canal: 'llamada', resultado: 'contesto_sigue_seguimiento', quePaso: 'hablamos', proximoFollowUp: '2026-07-10' }, 1);

  const pendientes = outboxPendientes();
  assert.strictEqual(pendientes.length, 1);
  assert.strictEqual(pendientes[0].payload.notionPageId, 'page-abc');
  assert.strictEqual(pendientes[0].payload.proximoPaso, 'hablamos');
});

test('registrarToque NO encola nada si la empresa no tiene notion_page_id todavia', () => {
  seedEmpresa('emp-sin-notion', null);
  registrarToque({ idEmpresa: 'emp-sin-notion', canal: 'llamada', resultado: 'contesto_sigue_seguimiento', quePaso: 'hablamos', proximoFollowUp: '2026-07-10' }, 1);

  const raw = new Database(dbPath);
  const n = (raw.prepare("SELECT count(*) as n FROM outbox WHERE id_registro = 'emp-sin-notion'").get() as { n: number }).n;
  raw.close();
  assert.strictEqual(n, 0);
});

test('marcarOutboxEnviado saca la fila de pendientes (idempotencia del drenado)', () => {
  seedEmpresa('emp-enviar', 'page-enviar');
  registrarToque({ idEmpresa: 'emp-enviar', canal: 'llamada', resultado: 'contesto_sigue_seguimiento', proximoFollowUp: '2026-07-10' }, 1);

  const antes = outboxPendientes().filter((p) => p.payload.notionPageId === 'page-enviar');
  assert.strictEqual(antes.length, 1);

  marcarOutboxEnviado(antes[0].idOutbox);

  const despues = outboxPendientes().filter((p) => p.payload.notionPageId === 'page-enviar');
  assert.strictEqual(despues.length, 0);
});

test('marcarOutboxFallido con proximoIntento futuro mantiene la fila pendiente para mas tarde, no ahora', () => {
  seedEmpresa('emp-fallo', 'page-fallo');
  registrarToque({ idEmpresa: 'emp-fallo', canal: 'llamada', resultado: 'contesto_sigue_seguimiento', proximoFollowUp: '2026-07-10' }, 1);

  const fila = outboxPendientes().find((p) => p.payload.notionPageId === 'page-fallo')!;
  const futuro = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  marcarOutboxFallido(fila.idOutbox, 1, futuro);

  const pendientesAhora = outboxPendientes(new Date().toISOString()).filter((p) => p.payload.notionPageId === 'page-fallo');
  assert.strictEqual(pendientesAhora.length, 0);

  const pendientesFuturo = outboxPendientes(new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()).filter(
    (p) => p.payload.notionPageId === 'page-fallo',
  );
  assert.strictEqual(pendientesFuturo.length, 1);
});

test('escribirTranscriptCompleto cachea el resumen de Granola como transcript_resumen', () => {
  seedEmpresa('emp-transcript', 'page-transcript');
  const raw = new Database(dbPath);
  raw
    .prepare(`INSERT INTO toque (id_toque, id_empresa, fecha, canal, resultado, fuente) VALUES (100, 'emp-transcript', '2026-07-04T10:00:00.000Z', 'llamada', 'contesto_reunion', 'cockpit')`)
    .run();
  raw.close();

  escribirTranscriptCompleto(100, {
    proveedor: 'granola',
    transcriptId: 't-x',
    titulo: 'x',
    fecha: '2026-07-04T10:00:00.000Z',
    resumen: 'resumen de la llamada',
    url: null,
  });

  const raw2 = new Database(dbPath);
  const fila = raw2.prepare('SELECT transcript_resumen FROM toque WHERE id_toque = 100').get() as any;
  raw2.close();
  assert.strictEqual(fila.transcript_resumen, 'resumen de la llamada');
});

// Reemplaza a 'escribirTranscriptCompleto encola notasDiscovery en outbox' (2026-07-15): ese
// test codificaba el bug. El resumen crudo de Granola es narracion, no facts, y encolarlo como
// notasDiscovery ademas pisaba lo que hubiera en Notion. Los facts salen ahora de la fusion
// aprobada por el owner.
test('escribirTranscriptCompleto NO encola notasDiscovery: el resumen crudo no son facts', () => {
  seedEmpresa('emp-transcript-2', 'page-transcript-2');
  const raw = new Database(dbPath);
  raw
    .prepare(`INSERT INTO toque (id_toque, id_empresa, fecha, canal, resultado, fuente) VALUES (101, 'emp-transcript-2', '2026-07-04T10:00:00.000Z', 'llamada', 'contesto_reunion', 'cockpit')`)
    .run();
  raw.close();

  escribirTranscriptCompleto(101, {
    proveedor: 'granola',
    transcriptId: 't-y',
    titulo: 'y',
    fecha: '2026-07-04T10:00:00.000Z',
    resumen: 'resumen de la llamada',
    url: null,
  });

  const conNotas = outboxPendientes()
    .filter((p) => p.payload.notionPageId === 'page-transcript-2')
    .filter((p) => p.payload.notasDiscovery !== undefined);
  assert.strictEqual(
    conNotas.length,
    0,
    'las Notas Discovery solo salen de la fusion que el owner aprueba, nunca del resumen crudo',
  );
});

test.after(() => borrarDbPrueba(dbPath));
