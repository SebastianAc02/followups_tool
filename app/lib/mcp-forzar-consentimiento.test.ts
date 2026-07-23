// Prueba del mecanismo puro que cierra el hueco de consentimiento (Fase 6.1, review de
// seguridad 2026-07-23): forzarQueryConsentimiento es la UNICA logica real detras del hook
// `before` de app/lib/mcp-forzar-consentimiento.ts (el resto es el enchufe de better-auth,
// createAuthMiddleware + matcher, no testeable como unidad sin levantar todo el auth). Se
// prueba aca sin DB ni better-auth, mismo criterio que mcp-gate.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { betterAuth } from 'better-auth';
import { createAuthEndpoint } from 'better-auth/api';
import { forzarQueryConsentimiento, forzarConsentimientoMcp } from './mcp-forzar-consentimiento.ts';

test('fuerza prompt=consent exacto aunque el cliente no mande prompt', () => {
  const q = forzarQueryConsentimiento({ client_id: 'x', redirect_uri: 'https://evil.test/cb' });
  assert.equal(q.prompt, 'consent');
});

test('fuerza prompt=consent aunque el cliente pida otra cosa (prompt=none no lo salta)', () => {
  const q = forzarQueryConsentimiento({ prompt: 'none' });
  assert.equal(q.prompt, 'consent');
});

test('reemplaza el prompt entero, no lo mezcla (evita "login consent" que no calza con el !== estricto)', () => {
  const q = forzarQueryConsentimiento({ prompt: 'login select_account' });
  assert.equal(q.prompt, 'consent');
});

test('no toca el resto del query (client_id/redirect_uri/code_challenge se preservan)', () => {
  const q = forzarQueryConsentimiento({ client_id: 'abc', redirect_uri: 'https://x', code_challenge: 'y' });
  assert.deepEqual(q, { client_id: 'abc', redirect_uri: 'https://x', code_challenge: 'y', prompt: 'consent' });
});

test('funciona sin query previo (undefined)', () => {
  const q = forzarQueryConsentimiento(undefined);
  assert.deepEqual(q, { prompt: 'consent' });
});

// Test de INTEGRACION contra el pipeline real de better-auth (el que faltaba y dejo pasar
// el bug del review 2026-07-23: el hook reasignaba ctx.query y la mutacion se descartaba).
// Monta un endpoint de eco en el MISMO path que intercepta el hook (/mcp/authorize) y
// confirma que el `prompt=consent` forzado por el `before` hook SI llega a la logica del
// endpoint, aunque el cliente no lo mande. Si esto falla, el consentimiento no se fuerza y
// el vector de phishing (code sin pantalla) queda abierto.
const ecoAuthorize = {
  id: 'eco-authorize-test',
  endpoints: {
    ecoAuthorize: createAuthEndpoint(
      '/mcp/authorize',
      { method: 'GET', query: z.record(z.string(), z.any()) },
      async (ctx) => ctx.json({ query: ctx.query }),
    ),
  },
} as const;

const authEco = betterAuth({
  baseURL: 'https://test.local',
  secret: 'secreto-de-prueba-suficientemente-largo-1234567890',
  plugins: [ecoAuthorize, forzarConsentimientoMcp],
});

test('el hook fuerza prompt=consent en el pipeline REAL de better-auth, no solo en la funcion pura', async () => {
  // Cliente que NO manda prompt=consent (el caso de phishing): el hook debe forzarlo.
  const res = await (authEco.api as Record<string, (a: unknown) => Promise<unknown>>).ecoAuthorize({
    query: { client_id: 'atacante', redirect_uri: 'https://evil.test/cb' },
  });
  assert.equal((res as { query: { prompt?: string } }).query.prompt, 'consent');
});

test('el hook fuerza prompt=consent aunque el cliente pida prompt=none', async () => {
  const res = await (authEco.api as Record<string, (a: unknown) => Promise<unknown>>).ecoAuthorize({
    query: { client_id: 'atacante', prompt: 'none' },
  });
  assert.equal((res as { query: { prompt?: string } }).query.prompt, 'consent');
});
