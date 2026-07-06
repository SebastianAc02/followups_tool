// Verifica que GranolaAdapter encadena listar + detalle y filtra por terminos de
// texto (empresa/alias/telefono), sin pegarle a la Granola real (fetch mockeado).
// Forma verificada en vivo contra la API real el 2026-07-06: base
// public-api.granola.ai, list = {notes, hasMore, cursor} con NoteSummary (sin
// resumen), detail = Note completo con summary_text/web_url. El telefono NO es un
// campo estructurado -- por eso el matching es por terminos de texto, no por
// telefono a secas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;
process.env.FOLLOWUPS_CRYPTO_KEY = Buffer.alloc(32, 5).toString('base64');

const { guardarCredencialConector } = await import('../db/repository.ts');
const { crearGranolaAdapter } = await import('./granola.ts');

guardarCredencialConector('granola', 'grn_test_123', 'user-sebastian');

function fetchFalso(notesListadas: unknown[], detallesPorId: Record<string, unknown>) {
  return async (url: string | URL) => {
    const href = url.toString();
    if (href.includes('/v1/notes?')) {
      return new Response(JSON.stringify({ notes: notesListadas, hasMore: false, cursor: null }), { status: 200 });
    }
    const id = href.split('/v1/notes/')[1];
    return new Response(JSON.stringify(detallesPorId[id]), { status: 200 });
  };
}

test('encadena listar + detalle y devuelve solo la sesion cuyo texto menciona la empresa', async (t) => {
  const notes = [
    { id: 'n-1', title: 'Redes del Norte - Llamada 04.07.2026', created_at: '2026-07-04T10:00:00.000Z' },
    { id: 'n-2', title: 'Otra Empresa SAS - Llamada', created_at: '2026-07-04T11:00:00.000Z' },
  ];
  const detalles: Record<string, unknown> = {
    'n-1': { id: 'n-1', title: 'Redes del Norte - Llamada 04.07.2026', created_at: '2026-07-04T10:00:00.000Z', summary_text: 'hablamos de precios', web_url: 'https://notes.granola.ai/d/n-1' },
    'n-2': { id: 'n-2', title: 'Otra Empresa SAS - Llamada', created_at: '2026-07-04T11:00:00.000Z', summary_text: 'otra cosa sin relacion', web_url: null },
  };
  t.mock.method(globalThis, 'fetch', fetchFalso(notes, detalles));

  const adapter = crearGranolaAdapter('user-sebastian');
  const candidatas = await adapter.buscarCandidatas(['Redes del Norte'], '2026-07-04T00:00:00.000Z', '2026-07-04T23:59:59.000Z');

  assert.strictEqual(candidatas.length, 1);
  assert.strictEqual(candidatas[0].transcriptId, 'n-1');
  assert.strictEqual(candidatas[0].resumen, 'hablamos de precios');
});

test('coincide con acentos distintos (normaliza texto antes de comparar)', async (t) => {
  const notes = [{ id: 'n-3', title: 'Comunicación Andina - Llamada', created_at: '2026-07-04T10:00:00.000Z' }];
  const detalles = {
    'n-3': { id: 'n-3', title: 'Comunicación Andina - Llamada', created_at: '2026-07-04T10:00:00.000Z', summary_text: 'resumen', web_url: null },
  };
  t.mock.method(globalThis, 'fetch', fetchFalso(notes, detalles));

  const adapter = crearGranolaAdapter('user-sebastian');
  const candidatas = await adapter.buscarCandidatas(['comunicacion andina'], '2026-07-04T00:00:00.000Z', '2026-07-04T23:59:59.000Z');

  assert.strictEqual(candidatas.length, 1);
});

test('caso real: nombre_normalizado con sufijo legal (s a s) matchea titulo sin sufijo', async (t) => {
  const notes = [{ id: 'n-5', title: 'Phone call with Jenny Urrrea - digital coast', created_at: '2026-07-04T10:00:00.000Z' }];
  const detalles = {
    'n-5': { id: 'n-5', title: 'Phone call with Jenny Urrrea - digital coast', created_at: '2026-07-04T10:00:00.000Z', summary_text: 'resumen', web_url: null },
  };
  t.mock.method(globalThis, 'fetch', fetchFalso(notes, detalles));

  const adapter = crearGranolaAdapter('user-sebastian');
  const candidatas = await adapter.buscarCandidatas(['digital coast s a s'], '2026-07-04T00:00:00.000Z', '2026-07-04T23:59:59.000Z');

  assert.strictEqual(candidatas.length, 1);
});

test('un termino de telefono tambien sirve si aparece en el resumen', async (t) => {
  const notes = [{ id: 'n-4', title: 'Phone call with Jenny - digital coast', created_at: '2026-07-04T10:00:00.000Z' }];
  const detalles = {
    'n-4': {
      id: 'n-4',
      title: 'Phone call with Jenny - digital coast',
      created_at: '2026-07-04T10:00:00.000Z',
      summary_text: 'Contact\nJenny Urrea, Digital Coast\nPhone: +57 318 315 4417',
      web_url: null,
    },
  };
  t.mock.method(globalThis, 'fetch', fetchFalso(notes, detalles));

  const adapter = crearGranolaAdapter('user-sebastian');
  const candidatas = await adapter.buscarCandidatas(['digital coast', '3183154417'], '2026-07-04T00:00:00.000Z', '2026-07-04T23:59:59.000Z');

  assert.strictEqual(candidatas.length, 1);
});

test('sin credencial configurada, lanza error claro en vez de llamar a fetch', async () => {
  const adapter = crearGranolaAdapter('user-sin-credencial');
  await assert.rejects(
    () => adapter.buscarCandidatas(['Redes del Norte'], '2026-07-04T00:00:00.000Z', '2026-07-04T23:59:59.000Z'),
    /No hay credencial de Granola/,
  );
});

test.after(() => borrarDbPrueba(dbPath));
