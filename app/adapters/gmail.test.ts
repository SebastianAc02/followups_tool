// Etapa 1 (2026-07-14-secuencias-correo-gmail-design.md): OAuth de Gmail Workspace, app
// interna (@onepay.la). Fetch crudo, sin SDK `googleapis` (decision de arquitectura,
// checkpoint con Sebastian en la sesion que escribio este plan): gmail.send/gmail.readonly
// y el refresh de token son REST simple, no justifican una dependencia nueva (CLAUDE.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearDbPrueba, borrarDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;
process.env.FOLLOWUPS_CRYPTO_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.GOOGLE_CLIENT_ID = 'client-test';
process.env.GOOGLE_CLIENT_SECRET = 'secret-test';
process.env.APP_BASE_URL = 'https://app.test';

const { guardarCredencialConector } = await import('../db/repository.ts');
const {
  crearGmailAdapter,
  mandarCorreoDePrueba,
  intercambiarCodigoPorCredencial,
  emailGmailConectado,
  construirUrlConsentimientoGmail,
} = await import('./gmail.ts');

function credencialDePrueba() {
  return JSON.stringify({ refreshToken: 'refresh-abc', emailCuenta: 'sebastian@onepay.la', scopes: ['gmail.send'] });
}

test('construirUrlConsentimientoGmail arma la URL con client_id, redirect_uri y scopes correctos', () => {
  const url = new URL(construirUrlConsentimientoGmail('state-123'));
  assert.strictEqual(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.strictEqual(url.searchParams.get('client_id'), 'client-test');
  assert.strictEqual(url.searchParams.get('redirect_uri'), 'https://app.test/api/conectores/gmail/callback');
  assert.strictEqual(url.searchParams.get('state'), 'state-123');
  assert.match(url.searchParams.get('scope') ?? '', /gmail\.send/);
});

test('intercambiarCodigoPorCredencial intercambia el code y resuelve el email de la cuenta', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: string | URL, init: RequestInit = {}) => {
    const href = url.toString();
    if (href === 'https://oauth2.googleapis.com/token') {
      const body = new URLSearchParams(init.body as string);
      assert.strictEqual(body.get('grant_type'), 'authorization_code');
      assert.strictEqual(body.get('code'), 'code-real');
      return new Response(JSON.stringify({ access_token: 'access-xyz', refresh_token: 'refresh-nuevo' }), { status: 200 });
    }
    if (href === 'https://openidconnect.googleapis.com/v1/userinfo') {
      return new Response(JSON.stringify({ email: 'sebastian@onepay.la' }), { status: 200 });
    }
    throw new Error(`fetch no mockeado: ${href}`);
  });

  const credencial = await intercambiarCodigoPorCredencial('code-real');
  assert.strictEqual(credencial.refreshToken, 'refresh-nuevo');
  assert.strictEqual(credencial.emailCuenta, 'sebastian@onepay.la');
});

test('intercambiarCodigoPorCredencial truena con mensaje claro si Google responde con error', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Malformed auth code' }), { status: 400 }),
  );
  await assert.rejects(() => intercambiarCodigoPorCredencial('code-malo'), /Malformed auth code/);
});

test('intercambiarCodigoPorCredencial truena si Google no incluye refresh_token en una respuesta 200', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify({ access_token: 'access-xyz' }), { status: 200 }),
  );
  await assert.rejects(() => intercambiarCodigoPorCredencial('code-sin-refresh'), /Google no devolvio tokens validos/);
});

test('emailGmailConectado devuelve la cuenta guardada sin exponer el refreshToken', () => {
  guardarCredencialConector('gmail', credencialDePrueba(), 'user-5');
  assert.strictEqual(emailGmailConectado('user-5'), 'sebastian@onepay.la');
});

test('emailGmailConectado devuelve null si el usuario no conecto Gmail', () => {
  assert.strictEqual(emailGmailConectado('nadie'), null);
});

test('crearGmailAdapter sin credencial: enviarPaso truena con mensaje claro', async () => {
  const adapter = crearGmailAdapter('usuario-sin-gmail');
  await assert.rejects(
    () =>
      adapter.enviarPaso(
        'prueba',
        { email: 'x@onepay.la', telefono: null, nombre: null, empresa: null, cargo: null },
        { asunto: 'a', cuerpo: 'b', canal: 'correo' },
      ),
    /No hay Gmail conectado/,
  );
});

test('enviarPaso sin email en el destinatario truena antes de llamar a Google', async () => {
  guardarCredencialConector('gmail', credencialDePrueba(), 'user-1');
  const adapter = crearGmailAdapter('user-1');
  await assert.rejects(
    () =>
      adapter.enviarPaso(
        'prueba',
        { email: null, telefono: null, nombre: null, empresa: null, cargo: null },
        { asunto: 'a', cuerpo: 'b', canal: 'correo' },
      ),
    /requiere email/,
  );
});

test('enviarPaso refresca el access token y manda el mensaje bien armado a Gmail', async (t) => {
  guardarCredencialConector('gmail', credencialDePrueba(), 'user-2');
  let cuerpoEnviado: unknown = null;

  t.mock.method(globalThis, 'fetch', async (url: string | URL, init: RequestInit = {}) => {
    const href = url.toString();
    if (href === 'https://oauth2.googleapis.com/token') {
      const body = new URLSearchParams(init.body as string);
      assert.strictEqual(body.get('grant_type'), 'refresh_token');
      assert.strictEqual(body.get('refresh_token'), 'refresh-abc');
      return new Response(JSON.stringify({ access_token: 'access-xyz' }), { status: 200 });
    }
    if (href === 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send') {
      assert.strictEqual((init.headers as Record<string, string>).Authorization, 'Bearer access-xyz');
      cuerpoEnviado = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ id: 'msg-gmail-1' }), { status: 200 });
    }
    throw new Error(`fetch no mockeado: ${href}`);
  });

  const adapter = crearGmailAdapter('user-2');
  const resultado = await adapter.enviarPaso(
    'prueba',
    { email: 'destino@onepay.la', telefono: null, nombre: null, empresa: null, cargo: null },
    { asunto: 'Hola', cuerpo: 'Cuerpo del correo', canal: 'correo' },
  );

  assert.strictEqual(resultado.proveedor, 'gmail');
  assert.strictEqual(resultado.proveedorMensajeId, 'msg-gmail-1');
  assert.ok(cuerpoEnviado);
  const mensajeDecodificado = Buffer.from((cuerpoEnviado as { raw: string }).raw, 'base64url').toString('utf8');
  assert.match(mensajeDecodificado, /^To: destino@onepay\.la/);
  assert.match(mensajeDecodificado, /Subject: Hola/);
  assert.match(mensajeDecodificado, /Cuerpo del correo/);
});

test('enviarPaso manda el cuerpo como HTML con el link reescrito y el pixel de apertura inyectados', async (t) => {
  guardarCredencialConector('gmail', credencialDePrueba(), 'user-7');
  let mensajeDecodificado = '';

  t.mock.method(globalThis, 'fetch', async (url: string | URL, init: RequestInit = {}) => {
    const href = url.toString();
    if (href === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'access-xyz' }), { status: 200 });
    }
    if (href === 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send') {
      const cuerpo = JSON.parse(init.body as string) as { raw: string };
      mensajeDecodificado = Buffer.from(cuerpo.raw, 'base64url').toString('utf8');
      return new Response(JSON.stringify({ id: 'msg-html-1', threadId: 'thread-html-1' }), { status: 200 });
    }
    throw new Error(`fetch no mockeado: ${href}`);
  });

  const adapter = crearGmailAdapter('user-7');
  const resultado = await adapter.enviarPaso(
    'campana-42',
    { email: 'destino@onepay.la', telefono: null, nombre: null, empresa: null, cargo: null },
    { asunto: 'Hola', cuerpo: '<p>Hola</p><a href="https://onepay.la/x">visita</a>', canal: 'correo' },
  );

  assert.strictEqual(resultado.proveedorMensajeId, 'msg-html-1');
  assert.strictEqual(resultado.proveedorHiloId, 'thread-html-1');
  assert.match(mensajeDecodificado, /Content-Type: text\/html/);
  assert.match(
    mensajeDecodificado,
    /href="https:\/\/app\.test\/api\/track\/click\?c=campana-42&e=destino@onepay\.la&u=https%3A%2F%2Fonepay\.la%2Fx"/,
  );
  assert.match(
    mensajeDecodificado,
    /<img src="https:\/\/app\.test\/api\/track\/open\?c=campana-42&e=destino@onepay\.la" width="1" height="1" alt="" style="display:none" \/>/,
  );
});

test('enviarPaso propaga el error de Gmail con mensaje claro', async (t) => {
  guardarCredencialConector('gmail', credencialDePrueba(), 'user-3');
  t.mock.method(globalThis, 'fetch', async (url: string | URL) => {
    if (url.toString() === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'access-xyz' }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { message: 'insufficient scope' } }), { status: 403 });
  });
  const adapter = crearGmailAdapter('user-3');
  await assert.rejects(
    () =>
      adapter.enviarPaso(
        'prueba',
        { email: 'a@onepay.la', telefono: null, nombre: null, empresa: null, cargo: null },
        { asunto: 'a', cuerpo: 'b', canal: 'correo' },
      ),
    /insufficient scope/,
  );
});

test('mandarCorreoDePrueba manda al destinatario indicado con asunto de verificacion codificado RFC 2047', async (t) => {
  guardarCredencialConector('gmail', credencialDePrueba(), 'user-4');
  let mensajeDecodificado = '';
  t.mock.method(globalThis, 'fetch', async (url: string | URL, init: RequestInit = {}) => {
    if (url.toString() === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'access-xyz' }), { status: 200 });
    }
    const cuerpo = JSON.parse(init.body as string) as { raw: string };
    mensajeDecodificado = Buffer.from(cuerpo.raw, 'base64url').toString('utf8');
    return new Response(JSON.stringify({ id: 'msg-prueba-1' }), { status: 200 });
  });

  await mandarCorreoDePrueba('user-4', 'sebastian@onepay.la');
  assert.match(mensajeDecodificado, /^To: sebastian@onepay\.la/);
  const subjectLine = mensajeDecodificado.split('\r\n').find((l) => l.startsWith('Subject: '));
  assert.ok(subjectLine);
  const match = subjectLine!.match(/^Subject: =\?UTF-8\?B\?(.+)\?=$/);
  assert.ok(match, `Subject no vino codificado RFC 2047: ${subjectLine}`);
  const asuntoDecodificado = Buffer.from(match![1], 'base64').toString('utf8');
  assert.match(asuntoDecodificado, /^Conexión de Gmail verificada/);
});

test('enviarPaso neutraliza un salto de linea en el asunto (no inyecta un header nuevo)', async (t) => {
  guardarCredencialConector('gmail', credencialDePrueba(), 'user-6');
  let mensajeDecodificado = '';
  t.mock.method(globalThis, 'fetch', async (url: string | URL, init: RequestInit = {}) => {
    if (url.toString() === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'access-xyz' }), { status: 200 });
    }
    const cuerpo = JSON.parse(init.body as string) as { raw: string };
    mensajeDecodificado = Buffer.from(cuerpo.raw, 'base64url').toString('utf8');
    return new Response(JSON.stringify({ id: 'msg-inyeccion-1' }), { status: 200 });
  });

  const adapter = crearGmailAdapter('user-6');
  await adapter.enviarPaso(
    'prueba',
    { email: 'destino@onepay.la', telefono: null, nombre: null, empresa: null, cargo: null },
    { asunto: 'Hola\r\nBcc: atacante@evil.com', cuerpo: 'Cuerpo', canal: 'correo' },
  );

  const lineas = mensajeDecodificado.split('\r\n');
  assert.strictEqual(lineas.filter((l) => l.startsWith('Bcc:')).length, 0, 'no debe haber ningun header Bcc: inyectado');
  assert.strictEqual(lineas[1], 'Subject: Hola  Bcc: atacante@evil.com');
});

test('sacarDestinatario es un no-op documentado (Gmail no tiene secuencia externa de la que sacar a alguien)', async () => {
  guardarCredencialConector('gmail', credencialDePrueba(), 'user-8');
  const adapter = crearGmailAdapter('user-8');
  await assert.doesNotReject(() => adapter.sacarDestinatario('thread-x', 'quien@sea.com'));
});

test('leerEventosNuevos: hilo sin mensaje nuevo del destinatario devuelve []', async (t) => {
  guardarCredencialConector('gmail', credencialDePrueba(), 'user-9');
  t.mock.method(globalThis, 'fetch', async (url: string | URL) => {
    const href = url.toString();
    if (href === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'access-xyz' }), { status: 200 });
    }
    if (href.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/threads/thread-solo')) {
      return new Response(
        JSON.stringify({
          id: 'thread-solo',
          messages: [
            {
              id: 'thread-solo',
              internalDate: '1000',
              payload: { headers: [{ name: 'From', value: 'sebastian@onepay.la' }, { name: 'To', value: 'prospecto@x.com' }] },
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (href.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/messages?')) {
      return new Response(JSON.stringify({}), { status: 200 }); // sin rebotes
    }
    throw new Error(`fetch no mockeado: ${href}`);
  });

  const adapter = crearGmailAdapter('user-9');
  const eventos = await adapter.leerEventosNuevos('thread-solo', new Date(0).toISOString());
  assert.deepStrictEqual(eventos, []);
});

test('leerEventosNuevos: mensaje nuevo en el hilo que no viene de la cuenta conectada es un evento respondio', async (t) => {
  guardarCredencialConector('gmail', credencialDePrueba(), 'user-10');
  t.mock.method(globalThis, 'fetch', async (url: string | URL) => {
    const href = url.toString();
    if (href === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'access-xyz' }), { status: 200 });
    }
    if (href.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/threads/thread-resp')) {
      return new Response(
        JSON.stringify({
          id: 'thread-resp',
          messages: [
            {
              id: 'thread-resp',
              internalDate: '1000',
              payload: { headers: [{ name: 'From', value: 'sebastian@onepay.la' }, { name: 'To', value: 'prospecto@x.com' }] },
            },
            {
              id: 'msg-respuesta-1',
              internalDate: '2000',
              payload: { headers: [{ name: 'From', value: 'Prospecto <prospecto@x.com>' }] },
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (href.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/messages?')) {
      return new Response(JSON.stringify({}), { status: 200 });
    }
    throw new Error(`fetch no mockeado: ${href}`);
  });

  const adapter = crearGmailAdapter('user-10');
  const eventos = await adapter.leerEventosNuevos('thread-resp', new Date(0).toISOString());
  assert.strictEqual(eventos.length, 1);
  assert.strictEqual(eventos[0].tipo, 'respondio');
  assert.strictEqual(eventos[0].proveedorEventoId, 'msg-respuesta-1');
  assert.strictEqual(eventos[0].email, 'prospecto@x.com');
  assert.strictEqual(eventos[0].canal, 'correo');
});

test('leerEventosNuevos: mensaje de mailer-daemon con el email del destinatario en el cuerpo es un evento rebota', async (t) => {
  guardarCredencialConector('gmail', credencialDePrueba(), 'user-11');
  t.mock.method(globalThis, 'fetch', async (url: string | URL) => {
    const href = url.toString();
    if (href === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'access-xyz' }), { status: 200 });
    }
    if (href.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/threads/thread-rebote')) {
      return new Response(
        JSON.stringify({
          id: 'thread-rebote',
          messages: [
            {
              id: 'thread-rebote',
              internalDate: '1000',
              payload: {
                headers: [
                  { name: 'From', value: 'sebastian@onepay.la' },
                  { name: 'To', value: 'noexiste@dominio-fantasma.com' },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (href.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/messages?')) {
      return new Response(JSON.stringify({ messages: [{ id: 'bounce-1' }] }), { status: 200 });
    }
    if (href === 'https://gmail.googleapis.com/gmail/v1/users/me/messages/bounce-1?format=full') {
      return new Response(
        JSON.stringify({
          id: 'bounce-1',
          internalDate: '5000',
          payload: {
            headers: [{ name: 'From', value: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>' }],
            body: { data: Buffer.from('Tu mensaje a noexiste@dominio-fantasma.com no pudo entregarse.', 'utf8').toString('base64url') },
          },
        }),
        { status: 200 },
      );
    }
    throw new Error(`fetch no mockeado: ${href}`);
  });

  const adapter = crearGmailAdapter('user-11');
  const eventos = await adapter.leerEventosNuevos('thread-rebote', new Date(0).toISOString());
  assert.strictEqual(eventos.length, 1);
  assert.strictEqual(eventos[0].tipo, 'rebota');
  assert.strictEqual(eventos[0].proveedorEventoId, 'bounce-1');
  assert.strictEqual(eventos[0].email, 'noexiste@dominio-fantasma.com');
});

test('leerEventosNuevos: mensaje de mailer-daemon de OTRO destinatario no genera falso positivo en este hilo', async (t) => {
  guardarCredencialConector('gmail', credencialDePrueba(), 'user-12');
  t.mock.method(globalThis, 'fetch', async (url: string | URL) => {
    const href = url.toString();
    if (href === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'access-xyz' }), { status: 200 });
    }
    if (href.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/threads/thread-ok')) {
      return new Response(
        JSON.stringify({
          id: 'thread-ok',
          messages: [
            {
              id: 'thread-ok',
              internalDate: '1000',
              payload: { headers: [{ name: 'From', value: 'sebastian@onepay.la' }, { name: 'To', value: 'si-existe@dominio.com' }] },
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (href.startsWith('https://gmail.googleapis.com/gmail/v1/users/me/messages?')) {
      return new Response(JSON.stringify({ messages: [{ id: 'bounce-otro' }] }), { status: 200 });
    }
    if (href === 'https://gmail.googleapis.com/gmail/v1/users/me/messages/bounce-otro?format=full') {
      return new Response(
        JSON.stringify({
          id: 'bounce-otro',
          internalDate: '5000',
          payload: {
            headers: [{ name: 'From', value: 'mailer-daemon@googlemail.com' }],
            body: { data: Buffer.from('Tu mensaje a otro-cualquiera@dominio.com no pudo entregarse.', 'utf8').toString('base64url') },
          },
        }),
        { status: 200 },
      );
    }
    throw new Error(`fetch no mockeado: ${href}`);
  });

  const adapter = crearGmailAdapter('user-12');
  const eventos = await adapter.leerEventosNuevos('thread-ok', new Date(0).toISOString());
  assert.deepStrictEqual(eventos, []);
});

test.after(() => borrarDbPrueba(dbPath));
