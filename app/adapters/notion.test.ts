// Verifica que NotionAdapter arma las propiedades correctas del PATCH a /v1/pages/:id
// (fetch mockeado, sin pegarle a Notion real): notasDiscovery/proximoPaso como
// rich_text, fechaProximoPaso como date, y los 3 campos de la Tarea 6
// (fechaPrimerContacto, fechaUltimoContacto como date; toquesHechos como rich_text).
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;
process.env.FOLLOWUPS_CRYPTO_KEY = Buffer.alloc(32, 5).toString('base64');

const { guardarCredencialConector } = await import('../db/repository.ts');
const { crearNotionAdapter } = await import('./notion.ts');

function fetchFalso(handler: (path: string, init: RequestInit) => { status: number; body: unknown }) {
  return async (url: string | URL, init: RequestInit = {}) => {
    const href = url.toString().replace('https://api.notion.com', '');
    const { status, body } = handler(href, init);
    return new Response(JSON.stringify(body), { status });
  };
}

test('sin credencial de notion configurada, actualizarPagina truena con mensaje claro', async () => {
  // Corre PRIMERO a proposito, igual que en apollo.test.ts: la credencial recien se
  // guarda dentro de los tests siguientes, nunca a nivel de modulo.
  const adapter = crearNotionAdapter();
  await assert.rejects(() => adapter.actualizarPagina({ notionPageId: 'pagina-1' }), /No hay credencial de Notion/);
});

test('actualizarPagina manda notasDiscovery y proximoPaso como rich_text, fechaProximoPaso como date', async (t) => {
  guardarCredencialConector('notion', 'notion_test_key');
  let cuerpoEnviado: unknown = null;
  t.mock.method(
    globalThis,
    'fetch',
    fetchFalso((path, init) => {
      assert.strictEqual(path, '/v1/pages/pagina-1');
      cuerpoEnviado = JSON.parse(init.body as string);
      return { status: 200, body: {} };
    }),
  );

  const adapter = crearNotionAdapter();
  await adapter.actualizarPagina({
    notionPageId: 'pagina-1',
    notasDiscovery: 'resumen de la llamada',
    proximoPaso: 'mandar propuesta',
    fechaProximoPaso: '2026-07-10',
  });

  assert.deepEqual(cuerpoEnviado, {
    properties: {
      'Notas Discovery': { rich_text: [{ text: { content: 'resumen de la llamada' } }] },
      'Próximo Paso': { rich_text: [{ text: { content: 'mandar propuesta' } }] },
      'Fecha Próximo Paso': { date: { start: '2026-07-10' } },
    },
  });
});

test('actualizarPagina manda fechaPrimerContacto y fechaUltimoContacto como date, toquesHechos como rich_text', async (t) => {
  guardarCredencialConector('notion', 'notion_test_key');
  let cuerpoEnviado: unknown = null;
  t.mock.method(
    globalThis,
    'fetch',
    fetchFalso((path, init) => {
      cuerpoEnviado = JSON.parse(init.body as string);
      return { status: 200, body: {} };
    }),
  );

  const adapter = crearNotionAdapter();
  await adapter.actualizarPagina({
    notionPageId: 'pagina-1',
    fechaPrimerContacto: '2026-07-01',
    fechaUltimoContacto: '2026-07-08',
    toquesHechos: '2026-07-01 · Llamada · No contestó\n2026-07-08 · Whatsapp · Sigue en follow-up',
  });

  assert.deepEqual(cuerpoEnviado, {
    properties: {
      'Fecha Primer Contacto': { date: { start: '2026-07-01' } },
      'Fecha Último Contacto': { date: { start: '2026-07-08' } },
      Toques: {
        rich_text: [
          { text: { content: '2026-07-01 · Llamada · No contestó\n2026-07-08 · Whatsapp · Sigue en follow-up' } },
        ],
      },
    },
  });
});

test('actualizarPagina truena con mensaje claro si Notion responde error', async (t) => {
  guardarCredencialConector('notion', 'notion_test_key');
  t.mock.method(
    globalThis,
    'fetch',
    fetchFalso(() => ({ status: 400, body: { message: 'bad request' } })),
  );

  const adapter = crearNotionAdapter();
  await assert.rejects(() => adapter.actualizarPagina({ notionPageId: 'pagina-1' }), /Notion respondio 400/);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
