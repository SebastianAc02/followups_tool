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

import { marcarModoPrueba } from '../lib/modo-prueba.ts';

// Estos tests no son sobre el modo prueba: declaran real y se olvidan del tema. Sin
// esto, el Proxy del db lanza al no saber contra que base va (modo-prueba.ts no tiene
// default a proposito).
marcarModoPrueba(false);

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;
process.env.FOLLOWUPS_CRYPTO_KEY = Buffer.alloc(32, 5).toString('base64');
process.env.EVOLUTION_API_BASE_URL = 'http://localhost:8080';
// Sin esto iniciarConexion se niega a crear (decision de Sebastian 2026-07-15: una linea
// que no recibe respuestas es peor que ninguna). El test de "falta la variable" la borra
// y la restaura.
process.env.WHATSAPP_WEBHOOK_URL = 'http://followups-web:3000/api/webhooks/whatsapp';
process.env.WHATSAPP_WEBHOOK_TOKEN = 'tok_test';

const { guardarCredencialConector } = await import('../db/repository.ts');
const { crearEvolutionAdapter, iniciarConexionPorQr, ErrorEvolution, parsearAcuseLectura } = await import('./evolution.ts');

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
    () => adapter.enviarPaso('prueba', { email: null, telefono: null, nombre: 'Ana', empresa: null, cargo: null }, { asunto: null, cuerpo: 'hola', canal: 'whatsapp' }),
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
    { email: null, telefono: '573001234567', nombre: 'Ana', empresa: null, cargo: null },
    { asunto: null, cuerpo: 'Hola Ana', canal: 'whatsapp' },
  );

  assert.deepEqual(cuerpoEnviado, { number: '573001234567', text: 'Hola Ana', delay: 1200 });
  assert.strictEqual(resultado.proveedor, 'evolution');
  assert.strictEqual(resultado.proveedorMensajeId, 'msg-real-1');
});

// Descubierto en vivo el 2026-07-10 (prueba multicanal real, WhatsApp de verdad
// mandado): a diferencia de Apollo (traduce [nombre] a {{first_name}}, un merge-tag
// que APOLLO resuelve del lado suyo), Evolution no tiene motor de plantillas -- el
// texto que mandamos es EXACTAMENTE lo que llega a WhatsApp. Sin este fix, el
// contacto real recibio "Hola [nombre], ... en [empresa] ..." literal, sin
// sustituir. enviarPaso ahora sustituye el mismo trio de variables que Apollo
// ([nombre]/[empresa]/[cargo]), con los valores REALES del destinatario (no un
// merge-tag), directo antes de mandar.
test('enviarPaso sustituye [nombre]/[empresa]/[cargo] con los valores reales del destinatario (Evolution no tiene merge-tags como Apollo)', async (t) => {
  guardarCredencialConector('whatsapp', 'evolution_test_key');
  let cuerpoEnviado: unknown = null;
  t.mock.method(
    globalThis,
    'fetch',
    fetchFalso((path, init) => {
      cuerpoEnviado = JSON.parse(init.body as string);
      return { status: 200, body: { key: { id: 'msg-real-2' }, status: 'PENDING' } };
    }),
  );

  const adapter = crearEvolutionAdapter();
  await adapter.enviarPaso(
    'linea-pool-1',
    { email: null, telefono: '573001234567', nombre: 'Ana', empresa: 'Viajes Andinos', cargo: 'Gerente Comercial' },
    { asunto: null, cuerpo: 'Hola [nombre], en [empresa] tu cargo es [cargo] y tu pasarela es [pasarela]', canal: 'whatsapp' },
  );

  assert.deepEqual(cuerpoEnviado, {
    number: '573001234567',
    // [pasarela] no es una de las 3 variables soportadas: queda intacta, igual que
    // en Apollo (traducirVariablesApollo), en vez de reventar o vaciarla.
    text: 'Hola Ana, en Viajes Andinos tu cargo es Gerente Comercial y tu pasarela es [pasarela]',
    delay: 1200,
  });
});

test('enviarPaso sin nombre/empresa/cargo deja la variable sin sustituir (no inventa un valor vacio)', async (t) => {
  guardarCredencialConector('whatsapp', 'evolution_test_key');
  let cuerpoEnviado: unknown = null;
  t.mock.method(
    globalThis,
    'fetch',
    fetchFalso((path, init) => {
      cuerpoEnviado = JSON.parse(init.body as string);
      return { status: 200, body: { key: { id: 'msg-real-3' }, status: 'PENDING' } };
    }),
  );

  const adapter = crearEvolutionAdapter();
  await adapter.enviarPaso(
    'linea-pool-1',
    { email: null, telefono: '573001234567', nombre: null, empresa: null, cargo: null },
    { asunto: null, cuerpo: 'Hola [nombre]', canal: 'whatsapp' },
  );

  assert.deepEqual(cuerpoEnviado, { number: '573001234567', text: 'Hola [nombre]', delay: 1200 });
});

test('iniciarConexion pide el numero por query y devuelve el pairing-code (metodo default, QR bloqueado)', async (t) => {
  guardarCredencialConector('whatsapp', 'evolution_test_key');
  t.mock.method(
    globalThis,
    'fetch',
    fetchFalso((path) => {
      // iniciarConexion pregunta primero si la instancia existe; aca ya existe, asi que
      // el camino es connect (crear-si-falta se prueba en su propio test, mas abajo).
      if (path === '/instance/fetchInstances') {
        return { status: 200, body: [{ name: 'prueba', connectionStatus: 'close' }] };
      }
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
    () => adapter.enviarPaso('prueba', { email: null, telefono: '570000000000', nombre: null, empresa: null, cargo: null }, { asunto: null, cuerpo: 'x', canal: 'whatsapp' }),
    /Evolution respondio 500/,
  );
});

// Formas capturadas EN VIVO contra el Evolution del VPS (2026-07-15, instancia
// temporal 'zz-tmp-claude' creada y borrada para esto). Ojo al detalle que la doc no
// dice: `create` devuelve el pairing-code ANIDADO en `qrcode.pairingCode`, mientras
// que `connect` lo devuelve en la RAIZ. No son la misma forma.
const CREATE_201 = {
  instance: {
    instanceName: 'wa-573105182997',
    instanceId: '3ea66446-1f8a-4fc5-b7e6-0127d0b0c1e9',
    integration: 'WHATSAPP-BAILEYS',
    status: 'connecting',
  },
  hash: '2671E60F-23C2-49A8-980E-B0CF9E7514EF',
  webhook: {},
  qrcode: { pairingCode: 'NZCYJA56', code: '2@pRkQ...', base64: 'data:image/png;base64,iVBOR', count: 1 },
};

test('iniciarConexion crea la instancia cuando Evolution todavia no la tiene, y devuelve el pairing-code del create', async (t) => {
  guardarCredencialConector('whatsapp', 'evolution_test_key');
  const llamadas: string[] = [];
  let cuerpoCreate: unknown = null;
  t.mock.method(
    globalThis,
    'fetch',
    fetchFalso((path, init) => {
      llamadas.push(`${init.method ?? 'GET'} ${path.split('?')[0]}`);
      if (path === '/instance/fetchInstances') return { status: 200, body: [] };
      if (path === '/instance/create') {
        cuerpoCreate = JSON.parse(init.body as string);
        return { status: 201, body: CREATE_201 };
      }
      return { status: 404, body: { status: 404, error: 'Not Found', response: { message: ['llamada inesperada'] } } };
    }),
  );

  const adapter = crearEvolutionAdapter();
  const inicio = await adapter.iniciarConexion('wa-573105182997', '573105182997');

  assert.deepEqual(inicio, { tipo: 'codigo', formato: 'pairing', data: 'NZCYJA56' });
  assert.deepEqual(llamadas, ['GET /instance/fetchInstances', 'POST /instance/create']);
  // Forma del bloque `webhook` capturada en vivo (2026-07-15, instancia temporal contra
  // el Evolution del VPS): se manda {url, byEvents, base64, events}. OJO: la respuesta
  // del create NO devuelve `events` ni `enabled` (solo webhookUrl/webhookByEvents/
  // webhookBase64), pero GET /webhook/find/<instancia> prueba que SI persisten. No se
  // puede usar la respuesta del create para confirmar que los eventos quedaron.
  assert.deepEqual(cuerpoCreate, {
    instanceName: 'wa-573105182997',
    number: '573105182997',
    qrcode: true,
    integration: 'WHATSAPP-BAILEYS',
    webhook: {
      url: 'http://followups-web:3000/api/webhooks/whatsapp?token=tok_test',
      byEvents: false,
      base64: false,
      events: ['MESSAGES_UPSERT'],
    },
  });
});

// Decision de Sebastian (2026-07-15): antes que una linea sorda, ninguna. Una instancia
// sin webhook manda y aparea bien, se ve verde, y la cadencia le sigue escribiendo a
// quien ya contesto -- rompe el requisito duro del plan EN SILENCIO. Se prefiere fallar
// ruidoso al primer intento. Lo critico del test es la segunda assertion: tiene que
// tirar ANTES de crear, o dejaria en Evolution justo la instancia sorda que evita.
test('iniciarConexion se niega a crear una linea sorda si falta WHATSAPP_WEBHOOK_URL', async (t) => {
  guardarCredencialConector('whatsapp', 'evolution_test_key');
  const previo = process.env.WHATSAPP_WEBHOOK_URL;
  delete process.env.WHATSAPP_WEBHOOK_URL;
  t.after(() => {
    process.env.WHATSAPP_WEBHOOK_URL = previo;
  });

  const llamadas: string[] = [];
  t.mock.method(
    globalThis,
    'fetch',
    fetchFalso((path, init) => {
      llamadas.push(`${init.method ?? 'GET'} ${path.split('?')[0]}`);
      if (path === '/instance/fetchInstances') return { status: 200, body: [] };
      return { status: 201, body: CREATE_201 };
    }),
  );

  const adapter = crearEvolutionAdapter();
  await assert.rejects(() => adapter.iniciarConexion('wa-573105182997', '573105182997'), /WHATSAPP_WEBHOOK_URL/);
  assert.ok(!llamadas.includes('POST /instance/create'), `no debio crear nada, llamo: ${llamadas.join(', ')}`);
});

// Contraparte del de arriba: el token es OPCIONAL a proposito, porque la ruta
// (app/api/webhooks/whatsapp/route.ts) solo lo EXIGE si esta seteado -- sin el, dev local
// procesa igual. Si estuviera seteado y no lo mandaramos, la ruta responderia 401 y la
// linea quedaria sorda igual, asi que cuando existe se manda si o si.
test('iniciarConexion registra el webhook sin ?token= cuando no hay WHATSAPP_WEBHOOK_TOKEN (dev local)', async (t) => {
  guardarCredencialConector('whatsapp', 'evolution_test_key');
  const previo = process.env.WHATSAPP_WEBHOOK_TOKEN;
  delete process.env.WHATSAPP_WEBHOOK_TOKEN;
  t.after(() => {
    process.env.WHATSAPP_WEBHOOK_TOKEN = previo;
  });

  let cuerpoCreate: { webhook?: { url?: string } } | null = null;
  t.mock.method(
    globalThis,
    'fetch',
    fetchFalso((path, init) => {
      if (path === '/instance/fetchInstances') return { status: 200, body: [] };
      cuerpoCreate = JSON.parse(init.body as string);
      return { status: 201, body: CREATE_201 };
    }),
  );

  const adapter = crearEvolutionAdapter();
  await adapter.iniciarConexion('wa-573105182997', '573105182997');

  assert.strictEqual(cuerpoCreate!.webhook!.url, 'http://followups-web:3000/api/webhooks/whatsapp');
});

test('iniciarConexion NO recrea una instancia que ya existe: pide connect y regenera el pairing-code', async (t) => {
  guardarCredencialConector('whatsapp', 'evolution_test_key');
  const llamadas: string[] = [];
  t.mock.method(
    globalThis,
    'fetch',
    fetchFalso((path, init) => {
      llamadas.push(`${init.method ?? 'GET'} ${path.split('?')[0]}`);
      if (path === '/instance/fetchInstances') {
        return { status: 200, body: [{ name: 'wa-573105182997', connectionStatus: 'close' }] };
      }
      // connect devuelve el pairingCode en la RAIZ (forma vieja, ya capturada en Fase 0)
      return { status: 200, body: { pairingCode: 'OTRO1234', base64: 'data:image/png;base64,x', count: 1 } };
    }),
  );

  const adapter = crearEvolutionAdapter();
  const inicio = await adapter.iniciarConexion('wa-573105182997', '573105182997');

  assert.deepEqual(inicio, { tipo: 'codigo', formato: 'pairing', data: 'OTRO1234' });
  assert.deepEqual(llamadas, ['GET /instance/fetchInstances', 'GET /instance/connect/wa-573105182997']);
});

// A (2026-07-15): descubierto reparando /conectores en vivo -- Evolution resuelve la
// instancia ANTES de validar la apikey, asi que un 404 en una ruta por-instancia
// ("logout/prueba", "sendText/prueba") no dice nada de la llave, dice que la instancia
// no existe. Es informacion DEFINITIVA (a diferencia de un timeout o un 500, donde de
// verdad no sabemos que paso), y quien llama necesita distinguirlos para poder corregir
// la fila de linea_whatsapp en vez de dejarla mintiendo en "activa".
test('ErrorEvolution reconoce el 404 de instancia inexistente y lo distingue de otros errores', () => {
  const err404 = new ErrorEvolution(
    404,
    '{"status":404,"error":"Not Found","response":{"message":["The \\"prueba\\" instance does not exist"]}}',
    '/instance/logout/prueba',
  );
  assert.strictEqual(err404.instanciaNoExiste, true);
  // El mensaje no cambia: hay tests y UI que lo leen tal cual.
  assert.match(err404.message, /Evolution respondio 404 en \/instance\/logout\/prueba/);

  const err500 = new ErrorEvolution(500, 'boom', '/message/sendText/x');
  assert.strictEqual(err500.instanciaNoExiste, false);
  // Un 404 que NO es de instancia (ruta mal escrita) tampoco cuenta.
  assert.strictEqual(new ErrorEvolution(404, '{"error":"Cannot POST /nope"}', '/nope').instanciaNoExiste, false);
});

test('llamarEvolution tira ErrorEvolution (no un Error generico) cuando la respuesta no es ok', async (t) => {
  guardarCredencialConector('whatsapp', 'evolution_test_key');
  t.mock.method(
    globalThis,
    'fetch',
    fetchFalso(() => ({
      status: 404,
      body: { status: 404, error: 'Not Found', response: { message: ['The "prueba" instance does not exist'] } },
    })),
  );

  const adapter = crearEvolutionAdapter();
  await assert.rejects(() => adapter.desconectar('prueba'), (e: unknown) => {
    assert.ok(e instanceof ErrorEvolution, 'tiene que ser ErrorEvolution, no un Error generico');
    assert.strictEqual((e as InstanceType<typeof ErrorEvolution>).instanciaNoExiste, true);
    return true;
  });
});

test('parsearAcuseLectura extrae el visto de un messages.update con status READ', () => {
  const payload = {
    event: 'messages.update',
    instance: 'prueba',
    data: { key: { id: 'MSG-123', remoteJid: '573102186819@s.whatsapp.net', fromMe: true }, status: 'READ' },
  };
  const acuse = parsearAcuseLectura(payload);
  assert.equal(acuse?.proveedorMensajeId, 'MSG-123');
  assert.equal(acuse?.tipo, 'visto');
});

test('parsearAcuseLectura ignora un DELIVERY_ACK (entregado, no leido)', () => {
  const payload = { event: 'messages.update', instance: 'prueba', data: { key: { id: 'M2' }, status: 'DELIVERY_ACK' } };
  assert.equal(parsearAcuseLectura(payload), null);
});

test.after(() => borrarDbPrueba(dbPath));
