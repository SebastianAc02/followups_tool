// Verifica que EvolutionAdapter arma las llamadas correctas contra Fase 0 (fetch
// mockeado, sin pegarle al servidor real): sendText con number/text, connect con
// ?number= devolviendo el pairing-code, fetchInstances filtrado por nombre de
// instancia. Todos los shapes (connect con pairingCode, sendText de EXITO,
// fetchInstances, error 500) estan capturados/confirmados en vivo contra el servidor
// de Fase 0 (../whatsapp-osserver, instancia 'prueba', 2026-07-09) -- ver comentarios
// en evolution.ts. El QR quedo bloqueado server-side (crackdown WhatsApp junio 2026);
// pairing-code es el metodo default, la rama de QR (iniciarConexionPorQr) se prueba
// aparte.
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;
process.env.FOLLOWUPS_CRYPTO_KEY = Buffer.alloc(32, 5).toString('base64');
process.env.EVOLUTION_API_BASE_URL = 'http://localhost:8080';

const { guardarCredencialConector } = await import('../db/repository.ts');
const { crearEvolutionAdapter, iniciarConexionPorQr } = await import('./evolution.ts');

function fetchFalso(handler: (path: string, init: RequestInit) => { status: number; body: unknown }) {
  return async (url: string | URL, init: RequestInit = {}) => {
    const href = url.toString().replace('http://localhost:8080', '');
    const { status, body } = handler(href, init);
    return new Response(JSON.stringify(body), { status });
  };
}

test('sin credencial de whatsapp configurada, cualquier operacion truena con mensaje claro', async () => {
  const adapter = crearEvolutionAdapter();
  await assert.rejects(() => adapter.iniciarConexion('prueba', '573001234567'), /No hay credencial de Evolution/);
});

test('enviarPaso sin telefono truena antes de llamar a Evolution', async () => {
  guardarCredencialConector('whatsapp', 'evolution_test_key');
  const adapter = crearEvolutionAdapter();
  await assert.rejects(
    () => adapter.enviarPaso('prueba', { email: null, telefono: null, nombre: 'Ana' }, { asunto: null, cuerpo: 'hola', canal: 'whatsapp' }),
    /requiere telefono/,
  );
});

test('enviarPaso manda number/text/delay al instance correcto y devuelve el id real', async (t) => {
  guardarCredencialConector('whatsapp', 'evolution_test_key');
  let cuerpoEnviado: unknown = null;
  t.mock.method(
    globalThis,
    'fetch',
    fetchFalso((path, init) => {
      assert.strictEqual(path, '/message/sendText/linea-pool-1');
      cuerpoEnviado = JSON.parse(init.body as string);
      // Forma de EXITO confirmada en vivo (2026-07-09, linea real conectada por
      // pairing-code): { key: { id }, status: 'PENDING' }.
      return { status: 200, body: { key: { id: 'msg-real-1' }, status: 'PENDING' } };
    }),
  );

  const adapter = crearEvolutionAdapter();
  const resultado = await adapter.enviarPaso(
    'linea-pool-1',
    { email: null, telefono: '573001234567', nombre: 'Ana' },
    { asunto: null, cuerpo: 'Hola Ana', canal: 'whatsapp' },
  );

  assert.deepEqual(cuerpoEnviado, { number: '573001234567', text: 'Hola Ana', delay: 1200 });
  assert.strictEqual(resultado.proveedor, 'evolution');
  assert.strictEqual(resultado.proveedorMensajeId, 'msg-real-1');
});

test('iniciarConexion pide el numero por query y devuelve el pairing-code (metodo default, QR bloqueado)', async (t) => {
  guardarCredencialConector('whatsapp', 'evolution_test_key');
  t.mock.method(
    globalThis,
    'fetch',
    fetchFalso((path) => {
      assert.strictEqual(path, '/instance/connect/prueba?number=573001234567');
      // Shape real capturado en vivo (2026-07-09, con ?number=): pairingCode ya no es
      // null. code/base64/count vienen igual, pero el metodo default ignora base64.
      return { status: 200, body: { pairingCode: 'BBSBZKCT', code: 'x', base64: 'data:image/png;base64,ABC123', count: 2 } };
    }),
  );

  const adapter = crearEvolutionAdapter();
  const resultado = await adapter.iniciarConexion('prueba', '573001234567');

  assert.deepEqual(resultado, { tipo: 'codigo', formato: 'pairing', data: 'BBSBZKCT' });
});

test('iniciarConexionPorQr (rama documentada, no default) sigue devolviendo el QR tal cual', async (t) => {
  guardarCredencialConector('whatsapp', 'evolution_test_key');
  t.mock.method(
    globalThis,
    'fetch',
    fetchFalso((path) => {
      assert.strictEqual(path, '/instance/connect/prueba');
      return { status: 200, body: { pairingCode: null, code: 'x', base64: 'data:image/png;base64,ABC123', count: 2 } };
    }),
  );

  const resultado = await iniciarConexionPorQr('prueba');

  assert.deepEqual(resultado, { tipo: 'codigo', formato: 'qr', data: 'data:image/png;base64,ABC123' });
});

test('estadoConexion filtra fetchInstances por nombre y mapea open/connecting/otro', async (t) => {
  guardarCredencialConector('whatsapp', 'evolution_test_key');
  t.mock.method(
    globalThis,
    'fetch',
    fetchFalso((path) => {
      assert.strictEqual(path, '/instance/fetchInstances');
      // Shape real (recortado a lo que usa el adaptador): array de instancias con
      // name + connectionStatus, capturado en vivo contra 'prueba' sin aparear.
      return {
        status: 200,
        body: [
          { name: 'prueba', connectionStatus: 'connecting' },
          { name: 'linea-pool-1', connectionStatus: 'open' },
        ],
      };
    }),
  );

  const adapter = crearEvolutionAdapter();
  assert.strictEqual(await adapter.estadoConexion('prueba'), 'calentando');
  assert.strictEqual(await adapter.estadoConexion('linea-pool-1'), 'activa');
});

test('estadoConexion trata una instancia que no aparece en fetchInstances como caida', async (t) => {
  guardarCredencialConector('whatsapp', 'evolution_test_key');
  t.mock.method(
    globalThis,
    'fetch',
    fetchFalso(() => ({ status: 200, body: [] })),
  );

  const adapter = crearEvolutionAdapter();
  assert.strictEqual(await adapter.estadoConexion('linea-fantasma'), 'caida');
});

test('un 500 de Evolution (instancia sin conectar) truena con el status y el body crudo', async (t) => {
  guardarCredencialConector('whatsapp', 'evolution_test_key');
  t.mock.method(
    globalThis,
    'fetch',
    fetchFalso(() => ({
      // Shape real capturado en vivo: instancia sin conectar, sendText devuelve 500.
      status: 500,
      body: { status: 500, error: 'Internal Server Error', response: { message: "Cannot read properties of undefined (reading 'find')" } },
    })),
  );

  const adapter = crearEvolutionAdapter();
  await assert.rejects(
    () => adapter.enviarPaso('prueba', { email: null, telefono: '570000000000', nombre: null }, { asunto: null, cuerpo: 'x', canal: 'whatsapp' }),
    /Evolution respondio 500/,
  );
});

test.after(() => borrarDbPrueba(dbPath));
