// Pruebas del wiring OAuth del MCP dentro de Next (Fase 6,
// docs/superpowers/specs/2026-07-23-mcp-oauth-login-design.md). Los route handlers de
// app/api/mcp/route.ts son funciones (Request) => Promise<Response> puras (sin next/server):
// se llaman directo, sin levantar un servidor Next real, mismo principio que ya usa
// app/mcp/server.test.ts para el proceso standalone (alla con HTTP real porque la tool ahi
// es un http.Server; aca no hace falta ni siquiera eso).
//
// El discovery se prueba llamando oAuthDiscoveryMetadata(auth)/oAuthProtectedResourceMetadata(auth)
// directo (los mismos helpers que app/.well-known/*/route.ts exportan como GET) -- evita
// depender de que el test runner del repo matchee un directorio con punto
// (app/.well-known/**), que ningun glob de package.json cubre hoy; el comportamiento
// verificado es identico al de esas dos rutas, son wrappers de una linea sobre auth.api.
//
// El login OAuth completo (dynamic client registration + authorize + consent + token) NO se
// corre aca: eso ya lo prueba better-auth. Se simula el resultado (una fila de
// oauth_access_token valida) insertandola directo, igual que tools.test.ts sembra empresa
// con INSERT crudo en vez de pasar por el flujo completo de captura.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba, borrarDbPrueba, agregarEsquemaAuthOAuth } from '../../db/test-helpers.ts';

const dbPath = crearDbPrueba();
agregarEsquemaAuthOAuth(dbPath);
process.env.ISPS_DB_PATH = dbPath;
process.env.BETTER_AUTH_URL = 'https://followupsonepay.duckdns.org';
process.env.BETTER_AUTH_SECRET = 'secreto-de-prueba-suficientemente-largo-1234567890';

const { auth } = await import('../../lib/auth.ts');
const { POST } = await import('./route.ts');
const { oAuthDiscoveryMetadata, oAuthProtectedResourceMetadata } = await import('better-auth/plugins');

const ORG_ONEPAY = 5001;
const ORG_VISITANTES = 5002;

function seedOrganizacion(id: number, nombre: string) {
  const raw = new Database(dbPath);
  raw.prepare(`INSERT INTO organizacion (id_organizacion, nombre) VALUES (?, ?)`).run(id, nombre);
  raw.close();
}

function seedMiembro(idOrganizacion: number, idUser: string, owner: string) {
  const raw = new Database(dbPath);
  raw
    .prepare(`INSERT INTO organizacion_miembro (id_organizacion, owner_canonico, nombre_display, id_user) VALUES (?, ?, ?, ?)`)
    .run(idOrganizacion, owner, owner, idUser);
  raw.close();
}

function seedUsuario(id: string, opts: { owner?: string | null; admin?: boolean; verTodoPipeline?: boolean } = {}) {
  const raw = new Database(dbPath);
  raw
    .prepare(
      `INSERT INTO user (id, name, email, owner, admin, ver_todo_pipeline) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, id, `${id}@onepay.test`, opts.owner ?? null, opts.admin ? 1 : 0, opts.verTodoPipeline ? 1 : 0);
  raw.close();
}

function seedAccessToken(idUsuario: string, accessToken: string) {
  const raw = new Database(dbPath);
  const ahora = Date.now();
  raw
    .prepare(
      `INSERT INTO oauth_access_token
        (id, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at, client_id, user_id, scopes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      `token-row-${accessToken}`,
      accessToken,
      `refresh-${accessToken}`,
      ahora + 3600_000,
      ahora + 604_800_000,
      'client-de-prueba',
      idUsuario,
      'openid profile email',
    );
  raw.close();
}

seedOrganizacion(ORG_ONEPAY, 'Onepay');
seedOrganizacion(ORG_VISITANTES, 'Visitantes');

seedUsuario('admin-1', { admin: true });
seedMiembro(ORG_ONEPAY, 'admin-1', 'Sebastian Acosta Molina');
seedAccessToken('admin-1', 'token-admin-1');

seedUsuario('cro-1', { verTodoPipeline: true, owner: 'Camilo Fonseca' });
seedMiembro(ORG_ONEPAY, 'cro-1', 'Camilo Fonseca');
seedAccessToken('cro-1', 'token-cro-1');

seedUsuario('owner-1', { owner: 'Felipe Castro' });
seedMiembro(ORG_ONEPAY, 'owner-1', 'Felipe Castro');
seedAccessToken('owner-1', 'token-owner-1');

seedUsuario('visitante-1', { owner: 'Juan Visitante' });
seedMiembro(ORG_VISITANTES, 'visitante-1', 'Juan Visitante');
seedAccessToken('visitante-1', 'token-visitante-1');

test.after(() => borrarDbPrueba(dbPath));

function requestMcp(bearer?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  return new Request('https://followupsonepay.duckdns.org/api/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
}

test('discovery: getMcpOAuthConfig trae el issuer configurado (BETTER_AUTH_URL)', async () => {
  const res = await oAuthDiscoveryMetadata(auth)(new Request('https://followupsonepay.duckdns.org/api/auth/.well-known/oauth-authorization-server'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.issuer, 'https://followupsonepay.duckdns.org');
  assert.equal(body.authorization_endpoint, 'https://followupsonepay.duckdns.org/api/auth/mcp/authorize');
  assert.equal(body.token_endpoint, 'https://followupsonepay.duckdns.org/api/auth/mcp/token');
});

test('discovery: getMCPProtectedResource trae el resource y el authorization server del mismo origen', async () => {
  const res = await oAuthProtectedResourceMetadata(auth)(new Request('https://followupsonepay.duckdns.org/api/auth/.well-known/oauth-protected-resource'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.resource, 'https://followupsonepay.duckdns.org');
  assert.deepEqual(body.authorization_servers, ['https://followupsonepay.duckdns.org']);
});

test('POST /api/mcp sin Authorization: 401 con WWW-Authenticate apuntando al resource metadata', async () => {
  const res = await POST(requestMcp());
  assert.equal(res.status, 401);
  const wwwAuth = res.headers.get('WWW-Authenticate');
  assert.ok(wwwAuth, 'debe traer WWW-Authenticate');
  assert.match(wwwAuth!, /resource_metadata="https:\/\/followupsonepay\.duckdns\.org\/api\/auth\/\.well-known\/oauth-protected-resource"/);
});

test('POST /api/mcp con token invalido: 401', async () => {
  const res = await POST(requestMcp('no-es-un-token-real'));
  assert.equal(res.status, 401);
});

test('POST /api/mcp con token de un Visitante logueado: 403, sin datos (gate de rol)', async () => {
  const res = await POST(requestMcp('token-visitante-1'));
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error.code, -32000);
});

test('POST /api/mcp con token de admin: pasa el gate (no 401 ni 403)', async () => {
  const res = await POST(requestMcp('token-admin-1'));
  assert.notEqual(res.status, 401);
  assert.notEqual(res.status, 403);
});

test('POST /api/mcp con token de verTodoPipeline (Camilo): pasa el gate', async () => {
  const res = await POST(requestMcp('token-cro-1'));
  assert.notEqual(res.status, 401);
  assert.notEqual(res.status, 403);
});

test('POST /api/mcp con token de un owner real de Onepay (no admin, no CRO): pasa el gate', async () => {
  const res = await POST(requestMcp('token-owner-1'));
  assert.notEqual(res.status, 401);
  assert.notEqual(res.status, 403);
});
