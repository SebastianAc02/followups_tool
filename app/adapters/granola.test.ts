// Verifica que GranolaAdapter encadena listar + detalle y filtra por terminos de
// texto (empresa/alias/telefono), sin pegarle a la Granola real (fetch mockeado).
// Forma verificada en vivo contra la API real el 2026-07-06: base
// public-api.granola.ai, list = {notes, hasMore, cursor} con NoteSummary (sin
// resumen), detail = Note completo con summary_text/web_url. El telefono NO es un
// campo estructurado, por eso el matching es por terminos de texto, no por
// telefono a secas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;
// Las dos rutas a la MISMA base: aca se prueba el filtro por terminos, no el ruteo entre
// bases. Sin esto, el test de modo prueba muere en "no such table: conector" --
// leerCredencialConector conmuta con el modo, igual que el resto de conectores, y una
// pruebas.db :memory: nace sin esquema.
process.env.PRUEBAS_DB_PATH = dbPath;
process.env.FOLLOWUPS_CRYPTO_KEY = Buffer.alloc(32, 5).toString('base64');

const { guardarCredencialConector } = await import('../db/repository.ts');
const { crearGranolaAdapter, ultimaNotaDe } = await import('./granola.ts');

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

test('ultimaNotaDe: trae la nota mas reciente (page_size=1, sin filtro de fecha) con resumen recortado', async (t) => {
  const notes = [{ id: 'n-ultima', title: 'Cliente X - Llamada', created_at: '2026-07-14T09:00:00.000Z' }];
  const detalles = {
    'n-ultima': {
      id: 'n-ultima',
      title: 'Cliente X - Llamada',
      created_at: '2026-07-14T09:00:00.000Z',
      summary_text: 'a'.repeat(300),
      web_url: 'https://notes.granola.ai/d/n-ultima',
    },
  };
  t.mock.method(globalThis, 'fetch', fetchFalso(notes, detalles));

  const nota = await ultimaNotaDe('user-sebastian');

  assert.ok(nota);
  assert.strictEqual(nota!.id, 'n-ultima');
  assert.strictEqual(nota!.titulo, 'Cliente X - Llamada');
  assert.strictEqual(nota!.fecha, '2026-07-14T09:00:00.000Z');
  assert.strictEqual(nota!.resumenCorto!.length, 200);
});

test('ultimaNotaDe: devuelve null si el usuario no tiene ninguna llamada grabada', async (t) => {
  t.mock.method(globalThis, 'fetch', fetchFalso([], {}));
  const nota = await ultimaNotaDe('user-sebastian');
  assert.strictEqual(nota, null);
});

test('ultimaNotaDe: lanza si no hay credencial guardada para ese usuario', async () => {
  await assert.rejects(() => ultimaNotaDe('user-sin-credencial'), /No hay credencial de Granola/);
});

test.after(() => borrarDbPrueba(dbPath));

// Modo prueba (Sebastian, 2026-07-15): el matching por terminos NO puede funcionar en la
// demo. Los toques son de empresas inventadas ("Viajes Andinos") con numeros de prueba, y
// la llamada real que Sebastian acaba de grabar en Granola no menciona ninguno de los dos:
// buscar por termino daria SIEMPRE cero candidatas y la demo se cae ahi.
//
// En prueba el adaptador devuelve las notas de la ventana SIN filtrar -- "la ultima llamada,
// la que sea". Cabe en el contrato del puerto, que dice explicito "el adaptador decide COMO
// buscar": el core sigue entregando terminos y ventana, el adaptador decide que en prueba no
// sirven. Fuera de prueba el filtro es el de siempre.
test('en modo prueba devuelve las notas de la ventana SIN filtrar por termino', async (t) => {
  const { marcarModoPrueba } = await import('../lib/modo-prueba.ts');
  const notes = [
    { id: 'p-1', title: 'Llamada con quien sea', created_at: '2026-07-04T10:00:00.000Z' },
    { id: 'p-2', title: 'Otra llamada distinta', created_at: '2026-07-04T11:00:00.000Z' },
  ];
  const detalles: Record<string, unknown> = {
    'p-1': { id: 'p-1', title: 'Llamada con quien sea', created_at: '2026-07-04T10:00:00.000Z', summary_text: 'resumen 1', web_url: null },
    'p-2': { id: 'p-2', title: 'Otra llamada distinta', created_at: '2026-07-04T11:00:00.000Z', summary_text: 'resumen 2', web_url: null },
  };
  t.mock.method(globalThis, 'fetch', fetchFalso(notes, detalles));

  marcarModoPrueba(true);
  const adapter = crearGranolaAdapter('user-sebastian');
  // Un termino que NO aparece en ninguna nota: fuera de prueba daria cero.
  const candidatas = await adapter.buscarCandidatas(['Viajes Andinos'], '2026-07-04T00:00:00.000Z', '2026-07-04T23:59:59.000Z');
  marcarModoPrueba(false);

  assert.strictEqual(candidatas.length, 2, 'en prueba no filtra: trae lo que haya en la ventana');
  assert.deepEqual(candidatas.map((c) => c.transcriptId).sort(), ['p-1', 'p-2']);
});

test('fuera de modo prueba, un termino que no aparece sigue dando cero', async (t) => {
  const { marcarModoPrueba } = await import('../lib/modo-prueba.ts');
  const notes = [{ id: 'r-1', title: 'Llamada con quien sea', created_at: '2026-07-04T10:00:00.000Z' }];
  const detalles = {
    'r-1': { id: 'r-1', title: 'Llamada con quien sea', created_at: '2026-07-04T10:00:00.000Z', summary_text: 'resumen', web_url: null },
  };
  t.mock.method(globalThis, 'fetch', fetchFalso(notes, detalles));

  marcarModoPrueba(false);
  const adapter = crearGranolaAdapter('user-sebastian');
  const candidatas = await adapter.buscarCandidatas(['Viajes Andinos'], '2026-07-04T00:00:00.000Z', '2026-07-04T23:59:59.000Z');

  assert.strictEqual(candidatas.length, 0, 'el matching real no se toca');
});
