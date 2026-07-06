// Verifica que ApolloAdapter arma los payloads exactos del contrato verificado en
// vivo (planning/experimento-apollo.md), sin pegarle a Apollo real (fetch mockeado):
// emailer_campaign_id EN EL CUERPO de add_contact_ids (no solo la URL), bulk_create
// con run_dedupe:true, y el mapeo de emailer_messages a eventos con id compuesto
// (mensaje:tipo) para que dos eventos del mismo mensaje no choquen en el indice unico.
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;
process.env.FOLLOWUPS_CRYPTO_KEY = Buffer.alloc(32, 5).toString('base64');
process.env.APOLLO_MAILBOX_ID = 'buzon-test-1';

const { guardarCredencialConector } = await import('../db/repository.ts');
const { crearApolloAdapter } = await import('./apollo.ts');

function fetchFalso(handler: (path: string, init: RequestInit) => { status: number; body: unknown }) {
  return async (url: string | URL, init: RequestInit = {}) => {
    const href = url.toString().replace('https://api.apollo.io/api/v1', '');
    const { status, body } = handler(href, init);
    return new Response(JSON.stringify(body), { status });
  };
}

test('sin credencial de apollo configurada, cualquier operacion truena con mensaje claro', async () => {
  // Corre PRIMERO a proposito: guardarCredencialConector('apollo', ...) recien se
  // llama dentro de los tests siguientes, nunca a nivel de modulo (si estuviera
  // arriba del archivo correria durante la carga, antes de que este test empiece,
  // y la credencial ya existiria cuando este test se ejecuta).
  const adapter = crearApolloAdapter();
  await assert.rejects(() => adapter.crearCampanaExterna('x'), /No hay credencial de Apollo/);
});

test('crearCampanaExterna manda el nombre y devuelve el id de la secuencia', async (t) => {
  guardarCredencialConector('apollo', 'apollo_test_key');
  let cuerpoEnviado: unknown = null;
  t.mock.method(
    globalThis,
    'fetch',
    fetchFalso((path, init) => {
      assert.strictEqual(path, '/emailer_campaigns');
      cuerpoEnviado = JSON.parse(init.body as string);
      return { status: 200, body: { emailer_campaign: { id: 'seq-1' } } };
    }),
  );

  const adapter = crearApolloAdapter();
  const id = await adapter.crearCampanaExterna('Cadencia frio julio');

  assert.strictEqual(id, 'seq-1');
  assert.deepEqual(cuerpoEnviado, { name: 'Cadencia frio julio' });
});

test('enviarPaso hace bulk_create con dedupe y add_contact_ids con emailer_campaign_id en el cuerpo', async (t) => {
  const llamadas: { path: string; body: unknown }[] = [];
  t.mock.method(
    globalThis,
    'fetch',
    fetchFalso((path, init) => {
      const body = init.body ? JSON.parse(init.body as string) : null;
      llamadas.push({ path, body });
      if (path === '/contacts/bulk_create') {
        return { status: 200, body: { created_contacts: [{ id: 'contacto-1', email: 'ana@empresa.com' }] } };
      }
      return { status: 200, body: {} };
    }),
  );

  const adapter = crearApolloAdapter();
  const resultado = await adapter.enviarPaso(
    'seq-1',
    { email: 'ana@empresa.com', nombre: 'Ana' },
    { asunto: 'Hola', cuerpo: 'cuerpo del correo', canal: 'correo' },
  );

  assert.strictEqual(resultado.proveedor, 'apollo');
  assert.strictEqual(resultado.proveedorMensajeId, 'contacto-1');

  assert.strictEqual(llamadas[0].path, '/contacts/bulk_create');
  assert.deepEqual(llamadas[0].body, {
    contacts: [{ email: 'ana@empresa.com', first_name: 'Ana' }],
    run_dedupe: true,
  });

  assert.strictEqual(llamadas[1].path, '/emailer_campaigns/seq-1/add_contact_ids');
  assert.deepEqual(llamadas[1].body, {
    emailer_campaign_id: 'seq-1',
    contact_ids: ['contacto-1'],
    send_email_from_email_account_id: 'buzon-test-1',
  });
});

test('enviarPaso truena si no hay buzon configurado (decision de negocio S2 pendiente)', async () => {
  delete process.env.APOLLO_MAILBOX_ID;
  const adapter = crearApolloAdapter();

  await assert.rejects(
    () => adapter.enviarPaso('seq-1', { email: 'ana@empresa.com', nombre: null }, { asunto: null, cuerpo: 'x', canal: 'correo' }),
    /APOLLO_MAILBOX_ID/,
  );
  process.env.APOLLO_MAILBOX_ID = 'buzon-test-1';
});

test('sacarDestinatario resuelve el contacto por email y llama remove_or_stop_contact_ids', async (t) => {
  const llamadas: { path: string; body: unknown }[] = [];
  t.mock.method(
    globalThis,
    'fetch',
    fetchFalso((path, init) => {
      const body = init.body ? JSON.parse(init.body as string) : null;
      llamadas.push({ path, body });
      if (path === '/contacts/bulk_create') {
        return { status: 200, body: { existing_contacts: [{ id: 'contacto-2', email: 'ana@empresa.com' }] } };
      }
      return { status: 200, body: {} };
    }),
  );

  const adapter = crearApolloAdapter();
  await adapter.sacarDestinatario('seq-1', 'ana@empresa.com');

  assert.strictEqual(llamadas[1].path, '/emailer_campaigns/seq-1/remove_or_stop_contact_ids');
  assert.deepEqual(llamadas[1].body, { emailer_campaign_id: 'seq-1', contact_ids: ['contacto-2'] });
});

test('archivarCampana llama el endpoint de archive de la secuencia', async (t) => {
  let pathLlamado = '';
  t.mock.method(
    globalThis,
    'fetch',
    fetchFalso((path) => {
      pathLlamado = path;
      return { status: 200, body: {} };
    }),
  );

  const adapter = crearApolloAdapter();
  await adapter.archivarCampana('seq-1');

  assert.strictEqual(pathLlamado, '/emailer_campaigns/seq-1/archive');
});

test('leerEventosNuevos mapea emailer_messages a eventos con id compuesto mensaje:tipo', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    fetchFalso((path) => {
      assert.ok(path.startsWith('/emailer_messages/search?'));
      assert.ok(path.includes('emailer_campaign_ids%5B%5D=seq-1'));
      return {
        status: 200,
        body: {
          emailer_messages: [
            {
              id: 'msg-1',
              email: 'ana@empresa.com',
              sent_at: '2026-07-05T10:00:00Z',
              opened_at: '2026-07-05T11:00:00Z',
              replied_at: null,
            },
          ],
        },
      };
    }),
  );

  const adapter = crearApolloAdapter();
  const eventos = await adapter.leerEventosNuevos('seq-1', '2026-07-01T00:00:00Z');

  assert.strictEqual(eventos.length, 2);
  assert.deepEqual(
    eventos.map((e) => e.proveedorEventoId).sort(),
    ['msg-1:abierto', 'msg-1:enviado'],
  );
  assert.ok(eventos.every((e) => e.email === 'ana@empresa.com'));
});

test('un mensaje sin ningun campo de fecha no produce eventos', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    fetchFalso(() => ({ status: 200, body: { emailer_messages: [{ id: 'msg-2', email: 'x@x.com' }] } })),
  );

  const adapter = crearApolloAdapter();
  const eventos = await adapter.leerEventosNuevos('seq-1', '2026-07-01T00:00:00Z');

  assert.strictEqual(eventos.length, 0);
});

test('un mensaje sin NINGUN campo de email conocido se descarta (no hay con que resolver destinatario)', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    fetchFalso(() => ({
      status: 200,
      body: { emailer_messages: [{ id: 'msg-3', sent_at: '2026-07-05T10:00:00Z' }] },
    })),
  );

  const adapter = crearApolloAdapter();
  const eventos = await adapter.leerEventosNuevos('seq-1', '2026-07-01T00:00:00Z');

  assert.strictEqual(eventos.length, 0);
});

test.after(() => {
  borrarDbPrueba(dbPath);
});
