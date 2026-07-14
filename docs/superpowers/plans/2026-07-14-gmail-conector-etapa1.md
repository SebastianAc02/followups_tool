# Conector Gmail — Etapa 1 (OAuth + verificación real) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar una cuenta Gmail de Workspace (`@onepay.la`) desde `/conectores` por OAuth,
guardar la credencial cifrada, y probarla de verdad (correo real) antes de marcarla
`Configurado`. No toca campañas, `push.ts`, `tracking.ts` ni `registro-envio.ts` — eso es
Etapa 2/3 (spec `docs/superpowers/specs/2026-07-14-secuencias-correo-gmail-design.md`), fuera
de alcance de este plan a propósito.

**Architecture:** Nuevo adaptador `app/adapters/gmail.ts` con **fetch crudo** (sin SDK
`googleapis` — decisión de arquitectura confirmada con Sebastián en la sesión que escribió
este plan: cero dependencia nueva, mismo patrón que `granola.ts`/`evolution.ts`/`apollo.ts`,
mismo estilo de test con `global.fetch` mockeado). Dos rutas nuevas bajo
`app/api/conectores/gmail/` orquestan el flujo OAuth; el estado "verificado" reusa la infra
de heartbeat que ya existe (`registrarHeartbeatConector`/`estado-ui.ts`), sin tocar el schema.

**Tech Stack:** Next.js App Router (route handlers), TypeScript, Drizzle/SQLite (sin cambios
de schema), `node:test` + `node:assert/strict`.

---

## File Structure

- **Modify:** `app/conectores/catalogo.ts` — nueva entrada `gmail` en `CATALOGO_CONECTORES`.
- **Create:** `app/adapters/gmail.ts` — OAuth (URL de consentimiento, intercambio de código,
  refresh de access token), `crearGmailAdapter` (`CanalEntrega`), `mandarCorreoDePrueba`,
  `emailGmailConectado`.
- **Create:** `app/adapters/gmail.test.ts` — pruebas unitarias, `fetch` mockeado.
- **Create:** `app/api/conectores/gmail/iniciar/route.ts` — arranca el flujo OAuth.
- **Create:** `app/api/conectores/gmail/callback/route.ts` — recibe el `code`, guarda
  credencial tentativa, manda correo de prueba.
- **Create:** `app/conectores/gmail-actions.ts` — `confirmarVerificacionGmailAction`,
  `reenviarPruebaGmailAction`.
- **Create:** `app/conectores/GmailConector.tsx` — UI: botón "Conectar Gmail" /
  "revisa tu bandeja" / "Conectado".
- **Modify:** `app/conectores/ConectorRow.tsx` — rama `cat.id === "gmail"`.
- **Modify:** `app/conectores/page.tsx` — resuelve y pasa `emailConectado` para Gmail.

---

## Task 1: Catálogo — entrada `gmail`

**Files:**
- Modify: `app/conectores/catalogo.ts`

- [ ] **Step 1: Agregar la entrada al catálogo**

En `app/conectores/catalogo.ts`, dentro de `CATALOGO_CONECTORES`, después de la entrada
`whatsapp`:

```ts
  {
    id: 'gmail',
    nombre: 'Gmail',
    descripcion: 'Manda cadencias de correo desde tu propio Gmail de Workspace.',
    modoSugerido: 'personal',
  },
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add app/conectores/catalogo.ts
git commit -m "feat(conectores): agrega Gmail al catalogo de conectores"
```

---

## Task 2: `app/adapters/gmail.ts` — OAuth (URL de consentimiento + intercambio de código)

**Files:**
- Create: `app/adapters/gmail.ts`
- Test: `app/adapters/gmail.test.ts`

- [ ] **Step 1: Escribir el archivo de test con la primera prueba (falla: el módulo no existe)**

Crear `app/adapters/gmail.test.ts`:

```ts
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

test('intercambiarCodigoPorCredencial truena con mensaje claro si Google no devuelve refresh_token', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Malformed auth code' }), { status: 400 }),
  );
  await assert.rejects(() => intercambiarCodigoPorCredencial('code-malo'), /Malformed auth code/);
});

test('emailGmailConectado devuelve la cuenta guardada sin exponer el refreshToken', () => {
  guardarCredencialConector('gmail', credencialDePrueba(), 'user-5');
  assert.strictEqual(emailGmailConectado('user-5'), 'sebastian@onepay.la');
});

test('emailGmailConectado devuelve null si el usuario no conecto Gmail', () => {
  assert.strictEqual(emailGmailConectado('nadie'), null);
});

test.after(() => borrarDbPrueba(dbPath));
```

- [ ] **Step 2: Correr los tests, verificar que fallan**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/adapters/gmail.test.ts`
Expected: FAIL — `Cannot find module './gmail.ts'`.

- [ ] **Step 3: Crear `app/adapters/gmail.ts` con las funciones de OAuth**

```ts
import { leerCredencialConector } from '../db/repository';

// Etapa 1 (2026-07-14-secuencias-correo-gmail-design.md): OAuth de Gmail Workspace, app
// interna (@onepay.la). Fetch crudo, sin SDK `googleapis` -- decision explicita de
// Sebastian (checkpoint de arquitectura, misma sesion que escribio el plan): gmail.send/
// gmail.readonly y el refresh de token son REST simple, no justifican una dependencia
// nueva (CLAUDE.md: "no agregar dependencias nuevas sin justificar").
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'openid',
  'email',
];

export type CredencialGmail = {
  refreshToken: string;
  emailCuenta: string;
  scopes: string[];
};

function clienteOAuth(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const base = process.env.APP_BASE_URL;
  if (!clientId || !clientSecret || !base) {
    throw new Error('Falta GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o APP_BASE_URL (revisa .env.local)');
  }
  return { clientId, clientSecret, redirectUri: `${base}/api/conectores/gmail/callback` };
}

// Paso 1 del flujo (design doc): boton "Conectar Gmail" -> esta URL. access_type=offline +
// prompt=consent garantizan que Google emita refresh_token incluso si el usuario ya habia
// autorizado la app antes (sin prompt=consent, un re-consentimiento NO trae refresh_token).
export function construirUrlConsentimientoGmail(state: string): string {
  const { clientId, redirectUri } = clienteOAuth();
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES.join(' '),
    state,
  });
  return `${OAUTH_AUTH_URL}?${query}`;
}

type TokenRespuesta = { access_token?: string; refresh_token?: string; error?: string; error_description?: string };

async function intercambiarCodigo(code: string): Promise<{ accessToken: string; refreshToken: string }> {
  const { clientId, clientSecret, redirectUri } = clienteOAuth();
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const data = (await res.json()) as TokenRespuesta;
  if (!res.ok || !data.access_token || !data.refresh_token) {
    throw new Error(`Google no devolvio tokens validos: ${data.error_description ?? data.error ?? res.status}`);
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

async function refrescarAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = clienteOAuth();
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  const data = (await res.json()) as TokenRespuesta;
  if (!res.ok || !data.access_token) {
    throw new Error(`Google no pudo refrescar el access token: ${data.error_description ?? data.error ?? res.status}`);
  }
  return data.access_token;
}

async function resolverEmailCuenta(accessToken: string): Promise<string> {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = (await res.json()) as { email?: string };
  if (!res.ok || !data.email) throw new Error(`Google no devolvio el email de la cuenta conectada (${res.status})`);
  return data.email;
}

// Paso 2 del flujo (design doc): llamado desde el callback OAuth. Intercambia el `code` por
// tokens, resuelve que cuenta se conecto y arma la credencial a cifrar. No guarda nada -- el
// callback la persiste via guardarCredencialConector, mismo criterio del resto de
// conectores (el adaptador nunca escribe la DB).
export async function intercambiarCodigoPorCredencial(code: string): Promise<CredencialGmail> {
  const { accessToken, refreshToken } = await intercambiarCodigo(code);
  const emailCuenta = await resolverEmailCuenta(accessToken);
  return { refreshToken, emailCuenta, scopes: SCOPES };
}

function leerCredencial(idUsuario: string): CredencialGmail {
  const cruda = leerCredencialConector('gmail', idUsuario);
  if (!cruda) throw new Error(`No hay Gmail conectado para el usuario ${idUsuario}`);
  return JSON.parse(cruda) as CredencialGmail;
}

// Cuenta @onepay.la conectada, para mostrarla en /conectores. Nunca devuelve el
// refreshToken -- unico dato realmente secreto de la credencial (mismo criterio que
// estadoConector: nunca expone el secreto, ni siquiera enmascarado).
export function emailGmailConectado(idUsuario: string): string | null {
  try {
    return leerCredencial(idUsuario).emailCuenta;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Correr los tests, verificar que pasan**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/adapters/gmail.test.ts`
Expected: 5 tests PASS (los 3 que no dependen de `enviarPaso`/`mandarCorreoDePrueba` — el resto se agrega en la Tarea 3).

- [ ] **Step 5: Commit**

```bash
git add app/adapters/gmail.ts app/adapters/gmail.test.ts
git commit -m "feat(gmail): OAuth de Gmail Workspace - url de consentimiento + intercambio de codigo"
```

---

## Task 3: `crearGmailAdapter` + `mandarCorreoDePrueba` (envío real)

**Files:**
- Modify: `app/adapters/gmail.ts`
- Modify: `app/adapters/gmail.test.ts`

- [ ] **Step 1: Agregar los tests de envío (fallan: `crearGmailAdapter`/`mandarCorreoDePrueba` no existen)**

Agregar a `app/adapters/gmail.test.ts`, antes de `test.after(...)`:

```ts
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
  let cuerpoEnviado: { raw: string } | null = null;

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
  const mensajeDecodificado = Buffer.from(cuerpoEnviado!.raw, 'base64url').toString('utf8');
  assert.match(mensajeDecodificado, /^To: destino@onepay\.la/);
  assert.match(mensajeDecodificado, /Subject: Hola/);
  assert.match(mensajeDecodificado, /Cuerpo del correo/);
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

test('mandarCorreoDePrueba manda al destinatario indicado con asunto de verificacion', async (t) => {
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
  assert.match(mensajeDecodificado, /Subject: Conexión de Gmail verificada/);
});
```

Y agregar `crearGmailAdapter` y `mandarCorreoDePrueba` al `import` de `./gmail.ts` al inicio
del archivo (ya están listados en el `import` de la Tarea 2 — si se siguió el plan en orden,
ya están ahí).

- [ ] **Step 2: Correr los tests, verificar que fallan**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/adapters/gmail.test.ts`
Expected: FAIL — `crearGmailAdapter is not a function` / `mandarCorreoDePrueba is not a function`.

- [ ] **Step 3: Agregar el envío a `app/adapters/gmail.ts`**

Al final del archivo, agregar los imports de tipos y el resto de la implementación:

```ts
import type { CanalEntrega, DestinatarioEnvio, PasoEnvio, EnvioResultado } from '../core/ports/envio';
```

(agregar esta línea al bloque de imports, junto a `leerCredencialConector`)

```ts
function base64Url(texto: string): string {
  return Buffer.from(texto, 'utf8').toString('base64url');
}

// RFC 2822 minimo (To/Subject/Content-Type + cuerpo texto plano) -- Gmail acepta el mensaje
// completo en `raw`, base64url. v1 no manda HTML (eso llega en Etapa 3 junto con el
// pixel/link de tracking, ver nota de reuso del design doc).
function armarMensajeCrudo(destinatario: string, asunto: string, cuerpo: string): string {
  const mensaje = [`To: ${destinatario}`, `Subject: ${asunto}`, 'Content-Type: text/plain; charset=utf-8', '', cuerpo].join(
    '\r\n',
  );
  return base64Url(mensaje);
}

type GmailSendRespuesta = { id?: string; error?: { message?: string } };

async function enviarCorreoGmail(idUsuario: string, destinatario: string, asunto: string, cuerpo: string): Promise<string> {
  const credencial = leerCredencial(idUsuario);
  const accessToken = await refrescarAccessToken(credencial.refreshToken);
  const res = await fetch(GMAIL_SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: armarMensajeCrudo(destinatario, asunto, cuerpo) }),
  });
  const data = (await res.json()) as GmailSendRespuesta;
  if (!res.ok || !data.id) throw new Error(`Gmail respondio ${res.status} al mandar: ${data.error?.message ?? 'sin detalle'}`);
  return data.id;
}

// CanalEntrega solamente (Etapa 1): TrackingPoll (leerEventosNuevos/sacarDestinatario) llega
// en Etapa 3, cuando de verdad hay hilos que pollear -- declarar esos metodos ahora como
// stubs que tiran seria el "half-finished implementation" que CLAUDE.md prohibe.
// `proveedorCampanaId` queda sin usar a proposito: Gmail no tiene concepto de secuencia
// externa, la identidad de quien manda vive en idUsuario (cerrado sobre el adapter) -- mismo
// margen que Evolution ya se tomo con ese mismo parametro posicional (ver evolution.ts).
export function crearGmailAdapter(idUsuario: string): CanalEntrega {
  return {
    async enviarPaso(_proveedorCampanaId: string, destinatario: DestinatarioEnvio, paso: PasoEnvio): Promise<EnvioResultado> {
      if (!destinatario.email) throw new Error('Gmail requiere email y el destinatario no trae uno');
      const mensajeId = await enviarCorreoGmail(idUsuario, destinatario.email, paso.asunto ?? '(sin asunto)', paso.cuerpo);
      return { proveedor: 'gmail', proveedorMensajeId: mensajeId };
    },
  };
}

// Verificacion del conector (Etapa 1, paso 3 del design doc): envio directo, sin pasar por
// campana/paso_inscripcion -- mismo criterio que probarLineaAction de WhatsApp
// (lineas-whatsapp-actions.ts): es una prueba manual de conectividad, no un paso real, y por
// eso reusa enviarPaso en vez de duplicar el armado del mensaje.
export async function mandarCorreoDePrueba(idUsuario: string, destinatario: string): Promise<void> {
  const fecha = new Date().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
  await crearGmailAdapter(idUsuario).enviarPaso(
    'prueba',
    { email: destinatario, telefono: null, nombre: null, empresa: null, cargo: null },
    {
      asunto: `Conexión de Gmail verificada — ${fecha}`,
      cuerpo: 'Si ves este correo, tu Gmail esta conectado y mandando bien.',
      canal: 'correo',
    },
  );
}
```

- [ ] **Step 4: Correr los tests, verificar que pasan**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/adapters/gmail.test.ts`
Expected: todos los tests PASS (9 tests en total).

- [ ] **Step 5: Correr tsc**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 6: Commit**

```bash
git add app/adapters/gmail.ts app/adapters/gmail.test.ts
git commit -m "feat(gmail): crearGmailAdapter + mandarCorreoDePrueba, envio real via Gmail API"
```

---

## Task 4: Rutas OAuth (`iniciar` + `callback`)

**Files:**
- Create: `app/api/conectores/gmail/iniciar/route.ts`
- Create: `app/api/conectores/gmail/callback/route.ts`

Sin test automatizado (mismo criterio que `app/api/webhooks/whatsapp/route.ts`, que tampoco
tiene test file en este repo: la lógica pesada ya está probada en `gmail.ts`/`gmail.test.ts`;
estas rutas son cableado fino de Next.js — `requireSession`, cookies, redirects — que se
verifica con la **prueba real manual** de la Tarea 8, no con mocks de `next/server`).

- [ ] **Step 1: Crear la ruta que arranca el flujo OAuth**

Crear `app/api/conectores/gmail/iniciar/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { requireSession } from '../../../../lib/session';
import { construirUrlConsentimientoGmail } from '../../../../adapters/gmail';

const COOKIE_STATE = 'gmail_oauth_state';

// Arranca el flujo OAuth (Etapa 1, paso 1 del design doc): state random en cookie httpOnly
// de corta vida, verificado de vuelta en el callback (CSRF). requireSession primero: sin
// sesion valida no hay a que usuario conectarle el Gmail.
export async function GET() {
  await requireSession();
  const state = randomBytes(16).toString('hex');
  const res = NextResponse.redirect(construirUrlConsentimientoGmail(state));
  res.cookies.set(COOKIE_STATE, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/api/conectores/gmail',
  });
  return res;
}
```

- [ ] **Step 2: Crear la ruta de callback**

Crear `app/api/conectores/gmail/callback/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '../../../../lib/session';
import { intercambiarCodigoPorCredencial, mandarCorreoDePrueba } from '../../../../adapters/gmail';
import { guardarCredencialConector, registrarHeartbeatConector } from '../../../../db/repository';

const COOKIE_STATE = 'gmail_oauth_state';

// Callback OAuth (Etapa 1, pasos 2-4 del design doc): intercambia code -> credencial, la
// guarda TENTATIVA (estado activo, ultimoResultado todavia null = "Configurado" en
// vistaEstado, no "Vivo" -- ver app/conectores/estado-ui.ts), manda el correo de prueba, y
// deja que /conectores muestre "revisa tu bandeja" -- solo confirmarVerificacionGmailAction
// (gmail-actions.ts) marca 'ok'.
export async function GET(req: NextRequest) {
  const sesion = await requireSession();
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const stateCookie = req.cookies.get(COOKIE_STATE)?.value;

  if (!code || !state || !stateCookie || state !== stateCookie) {
    return NextResponse.redirect(new URL('/conectores?gmailError=state', req.url));
  }

  try {
    const credencial = await intercambiarCodigoPorCredencial(code);
    guardarCredencialConector('gmail', JSON.stringify(credencial), sesion.id);

    try {
      await mandarCorreoDePrueba(sesion.id, credencial.emailCuenta);
    } catch (e) {
      // La credencial SI quedo guardada (Google la emitio), pero la prueba de envio fallo --
      // se registra como error (no como "pendiente de confirmar"), para que la UI muestre
      // "Caido" en vez de pedir confirmar un correo que nunca salio. Alerta real al admin
      // queda pendiente de app/lib/alerta-admin.ts (spec 2026-07-14-conectores-apollo-
      // granola-design.md, todavia no construido) -- no se duplica aca, ver nota del design
      // doc de este spec, paso 4 de la Etapa 1.
      const mensaje = e instanceof Error ? e.message : String(e);
      registrarHeartbeatConector('gmail', `error: ${mensaje}`, sesion.id);
      return NextResponse.redirect(new URL('/conectores?gmailError=prueba', req.url));
    }

    const res = NextResponse.redirect(new URL('/conectores', req.url));
    res.cookies.delete(COOKIE_STATE);
    return res;
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error(`Gmail OAuth callback fallo: ${mensaje}`);
    return NextResponse.redirect(new URL('/conectores?gmailError=oauth', req.url));
  }
}
```

- [ ] **Step 3: Correr tsc**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add app/api/conectores/gmail/
git commit -m "feat(gmail): rutas OAuth iniciar + callback"
```

---

## Task 5: Server actions de confirmación (`gmail-actions.ts`)

**Files:**
- Create: `app/conectores/gmail-actions.ts`

Sin test automatizado: mismo criterio que `lineas-whatsapp-actions.ts` (que tampoco tiene
test file) — son wrappers finos de `requireSession` + funciones ya probadas en
`gmail.test.ts`. Se verifican con la prueba real manual (Tarea 8).

- [ ] **Step 1: Crear `app/conectores/gmail-actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { registrarHeartbeatConector } from "../db/repository";
import { mandarCorreoDePrueba, emailGmailConectado } from "../adapters/gmail";
import { requireSession } from "../lib/session";

// Confirmacion manual (Etapa 1, paso 3 del design doc): el usuario dice "si, me llego"
// despues de revisar su bandeja -- mismo criterio de Pieza B (spec conectores-apollo-
// granola-design.md): solo la confirmacion explicita marca el conector como verdadero-
// Configurado. registrarHeartbeatConector(...,'ok',...) hace que vistaEstado (estado-ui.ts)
// pase de "Configurado" (amber, pendiente) a "Vivo" (verde) -- reusa infra existente, sin
// estado nuevo en el schema.
export async function confirmarVerificacionGmailAction(_formData: FormData): Promise<void> {
  const sesion = await requireSession();
  registrarHeartbeatConector('gmail', 'ok', sesion.id);
  revalidatePath('/conectores');
}

export type ResultadoReenvioGmail = { ok: true } | { ok: false; error: string };

// Reenvia el correo de prueba si el primero no llego (spam, cuota, lo que sea) sin que el
// usuario tenga que desconectar y reconectar todo el flujo OAuth.
export async function reenviarPruebaGmailAction(
  _previo: ResultadoReenvioGmail | null,
  _formData: FormData,
): Promise<ResultadoReenvioGmail> {
  const sesion = await requireSession();
  const email = emailGmailConectado(sesion.id);
  if (!email) return { ok: false, error: 'No hay Gmail conectado.' };

  try {
    await mandarCorreoDePrueba(sesion.id, email);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error mandando el correo de prueba.' };
  }
}
```

- [ ] **Step 2: Correr tsc**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add app/conectores/gmail-actions.ts
git commit -m "feat(gmail): server actions de confirmacion y reenvio de la prueba"
```

---

## Task 6: UI — `GmailConector.tsx`

**Files:**
- Create: `app/conectores/GmailConector.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
"use client";

import { useActionState } from "react";
import { Button } from "../ui/Button";
import type { EstadoConector } from "../db/repository";
import { confirmarVerificacionGmailAction, reenviarPruebaGmailAction, type ResultadoReenvioGmail } from "./gmail-actions";

// Etapa 1 (2026-07-14-secuencias-correo-gmail-design.md): reemplaza CredencialForm para
// Gmail -- no se pega una API key, se conecta por OAuth y se confirma con un correo de
// prueba real. Dos estados posibles (el tercero, "sin credencial", lo resuelve ConectorRow
// mostrando este componente vs el boton "Conectar"): pendiente de confirmar (credencial
// guardada, ultimoResultado todavia no es 'ok') y verificado (ultimoResultado === 'ok'). El
// texto de error (si el ultimo intento fallo) ya lo muestra ConectorRow arriba (hayError),
// no se duplica aca.
export function GmailConector({ estado, emailConectado }: { estado: EstadoConector; emailConectado: string | null }) {
  const verificado = estado.ultimoResultado === 'ok';

  const [resultadoReenvio, accionReenviar, reenviando] = useActionState<ResultadoReenvioGmail | null, FormData>(
    reenviarPruebaGmailAction,
    null,
  );

  if (!estado.tieneCredencial) {
    return (
      <a
        href="/api/conectores/gmail/iniciar"
        className="inline-flex items-center rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-bg hover:opacity-90"
      >
        Conectar Gmail
      </a>
    );
  }

  if (verificado) {
    return (
      <p className="text-sm text-muted">
        Conectado como <strong className="text-ink">{emailConectado}</strong>.
      </p>
    );
  }

  return (
    <div className="max-w-sm rounded-lg border border-dashed border-line p-4">
      <p className="text-sm leading-relaxed text-muted">
        Mandamos un correo de prueba a <strong className="text-ink">{emailConectado}</strong>. Revisa tu bandeja.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <form action={confirmarVerificacionGmailAction}>
          <Button type="submit">Sí, llegó — confirmar</Button>
        </form>
        <form action={accionReenviar}>
          <Button type="submit" variant="quiet" disabled={reenviando}>
            {reenviando ? "Enviando..." : "Reenviar prueba"}
          </Button>
        </form>
      </div>
      {resultadoReenvio && !resultadoReenvio.ok && (
        <p className="mt-2 text-xs text-overdue">{resultadoReenvio.error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Correr tsc**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add app/conectores/GmailConector.tsx
git commit -m "feat(gmail): UI de conexion/verificacion en /conectores"
```

---

## Task 7: Cablear `GmailConector` en `ConectorRow.tsx` + `page.tsx`

**Files:**
- Modify: `app/conectores/ConectorRow.tsx`
- Modify: `app/conectores/page.tsx`

- [ ] **Step 1: `ConectorRow.tsx` — importar y agregar la rama de Gmail**

En `app/conectores/ConectorRow.tsx`, agregar el import junto a `LineasWhatsapp`:

```ts
import { GmailConector } from "./GmailConector";
```

Agregar `emailConectadoGmail` a las props (junto a `misLineasWhatsapp`/`lineasWhatsappPool`):

```ts
export function ConectorRow({
  cat,
  estado,
  modo,
  esAdmin,
  misLineasWhatsapp,
  lineasWhatsappPool,
  emailConectadoGmail,
}: {
  cat: ConectorCatalogo;
  estado: EstadoConector;
  modo: ModoConector;
  esAdmin: boolean;
  misLineasWhatsapp?: LineaWhatsapp[];
  lineasWhatsappPool?: LineaWhatsapp[];
  emailConectadoGmail?: string | null;
}) {
```

Reemplazar el bloque `{puedeEditar ? (...) : ...}` para que Gmail use `GmailConector` en vez
de `CredencialForm` (Gmail siempre es `personal`, así que `puedeEditar` ya es `true` para
cualquier usuario — no hace falta tocar esa lógica, solo la rama del `if`):

```tsx
        {puedeEditar ? (
          cat.id === "gmail" ? (
            <GmailConector estado={estado} emailConectado={emailConectadoGmail ?? null} />
          ) : (
            <CredencialForm proveedor={cat.id} tieneCredencial={estado.tieneCredencial} />
          )
        ) : cat.id !== "whatsapp" ? (
          <p className="max-w-sm rounded-lg border border-dashed border-line p-4 text-sm leading-relaxed text-muted">
            Solo un admin puede configurar esta conexión. Si algo no llega, avísale a tu admin.
          </p>
        ) : null}
```

- [ ] **Step 2: `page.tsx` — resolver `emailConectadoGmail` y pasarlo**

En `app/conectores/page.tsx`, agregar el import de `emailGmailConectado`:

```ts
import { emailGmailConectado } from "../adapters/gmail";
```

Después de la línea de `misLineasWhatsapp`, agregar:

```ts
  // Etapa 1 (gmail): igual que emailCuenta de WhatsApp, el email conectado no es secreto
  // (a diferencia del refreshToken) -- se resuelve por fuera de estadoConector (que nunca
  // descifra nada) via una funcion Gmail-especifica en el adaptador.
  const emailConectadoGmail = emailGmailConectado(sesion.id);
```

Y pasar la prop en el `map`:

```tsx
            <ConectorRow
              key={a.cat.id}
              cat={a.cat}
              estado={a.estado}
              modo={a.modo}
              esAdmin={sesion.admin}
              misLineasWhatsapp={a.cat.id === "whatsapp" ? misLineasWhatsapp : undefined}
              lineasWhatsappPool={a.cat.id === "whatsapp" ? lineasPoolWhatsapp : undefined}
              emailConectadoGmail={a.cat.id === "gmail" ? emailConectadoGmail : undefined}
            />
```

- [ ] **Step 3: Correr tsc**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 4: Correr toda la suite de conectores**

Run: `ISPS_DB_PATH=:memory: node --experimental-strip-types --experimental-loader ./scripts/resolve-ts-ext.mjs --test app/conectores/*.test.ts app/adapters/gmail.test.ts`
Expected: todos PASS.

- [ ] **Step 5: Commit**

```bash
git add app/conectores/ConectorRow.tsx app/conectores/page.tsx
git commit -m "feat(gmail): cablea GmailConector en la fila del conector"
```

---

## Task 8: Compuerta manual + prueba real (Sebastián)

No es código — es la compuerta explícita que el design doc marca como no-negociable antes de
dar la Etapa 1 por lista ("máxima cautela — esto llega a producción", decisión 5 del spec).

- [ ] **Step 1: Crear el proyecto en Google Cloud Console**

Proyecto nuevo (o reusar uno existente de OnePay), pantalla de consentimiento OAuth tipo
**Interno** (requiere admin del Workspace `@onepay.la`), credenciales OAuth 2.0 tipo
"Web application" con **Authorized redirect URI** = `<APP_BASE_URL>/api/conectores/gmail/callback`
(mismo dominio que hoy usa `APP_BASE_URL` en `.env.local` — actualizar si el túnel cambió).

- [ ] **Step 2: Agregar las variables de entorno**

En `.env.local` (no se commitea):

```
GOOGLE_CLIENT_ID=<el client id de la consola>
GOOGLE_CLIENT_SECRET=<el client secret de la consola>
```

(`APP_BASE_URL` ya existe — confirmar que sigue apuntando a un dominio accesible desde
internet para que Google pueda hacer el redirect).

- [ ] **Step 3: Prueba real, de punta a punta**

1. Levantar el server (`npm run dev`), entrar a `/conectores` con sesión real.
2. Click "Conectar Gmail" → pantalla de consentimiento de Google → autorizar con un Gmail
   `@onepay.la` real de prueba.
3. Confirmar el redirect de vuelta a `/conectores` sin `gmailError` en la URL.
4. Revisar la bandeja de ese Gmail: debe llegar "Conexión de Gmail verificada — [fecha]".
5. En la UI, click "Sí, llegó — confirmar".
6. Confirmar que la fila pasa a mostrar "Vivo" (verde) y "Conectado como [email]".
7. Caso de error: revocar el acceso desde
   [myaccount.google.com/permissions](https://myaccount.google.com/permissions) y volver a
   intentar sin `prompt=consent` funcionando — confirmar que el mensaje de error que muestra
   `?gmailError=oauth` es legible, no un stack trace crudo.

- [ ] **Step 4: Marcar la Etapa 1 como lista**

Si los 3 pasos anteriores funcionan, la Etapa 1 está lista según el criterio de éxito del
design doc. Etapa 2 (Gmail como proveedor de envío de cadencias) es un plan aparte, y
depende de que el refactor de agrupar-por-dueño (compartido con
`gate-canal-campanas-design.md`) esté resuelto primero — no arrancar esa etapa sin confirmar
con Sebastián el estado de esa dependencia (ver "Dependencia dura" del design doc).

---

## Self-Review

**Cobertura del spec (Etapa 1):** catálogo ✓ (Task 1), credencial cifrada vía
`guardarCredencialConector` reusando el mecanismo existente ✓ (Task 4), flujo OAuth completo
(consentimiento → callback → intercambio) ✓ (Tasks 2, 4), correo de prueba real antes de
`Configurado` ✓ (Tasks 3, 4), confirmación explícita del usuario ✓ (Task 5, 6), manejo de
error con mensaje genérico + log (alerta real al admin diferida a
`app/lib/alerta-admin.ts`, explícitamente fuera de este plan) ✓ (Task 4), compuerta manual de
Google Cloud Console + prueba real ✓ (Task 8). `crearGmailAdapter`/`mandarCorreoDePrueba`
como función aparte del envío de producción ✓ (Task 3).

**Desviación consciente del sketch del design doc:** el spec sugiere
`crearGmailAdapter(idUsuario): CanalEntrega & TrackingPoll`. Este plan solo implementa
`CanalEntrega` — `TrackingPoll` (`leerEventosNuevos`/`sacarDestinatario`) no tiene nada real
que hacer hasta la Etapa 3 (poll de hilos), y stubearlo ahora violaría la regla de CLAUDE.md
contra implementaciones a medias. Se amplía el tipo de retorno cuando Etapa 3 construya esos
métodos de verdad.

**Fuera de alcance de este plan (confirmado con el design doc):** `registro-envio.ts`,
`push.ts`, `pasoInscripcionesPendientes`, `campana.owner`, tope diario/throttle, tracking de
abiertos/clics/respuestas/rebotes — todo eso es Etapa 2 y 3, planes aparte.

**Placeholder scan:** sin `TBD`/`TODO` — cada paso trae código completo. El único punto
"pendiente" real (alerta al admin) está explícitamente devuelto a su spec dueño, no dejado a
medias en este.

**Consistencia de tipos:** `CredencialGmail` se define una vez en `gmail.ts` (Task 2) y se
reusa igual en `gmail-actions.ts`/rutas (nunca redefinido). `EstadoConector` (de
`db/repository.ts`) se pasa sin cambios a `GmailConector`. `ResultadoReenvioGmail` sigue el
mismo patrón `{ ok: true } | { ok: false; error: string }` que `ResultadoGuardado`/
`ResultadoPrueba` ya usan en este mismo directorio.
