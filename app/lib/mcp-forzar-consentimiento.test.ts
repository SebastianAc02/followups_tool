// Prueba del mecanismo puro que cierra el hueco de consentimiento (Fase 6.1, review de
// seguridad 2026-07-23): forzarQueryConsentimiento es la UNICA logica real detras del hook
// `before` de app/lib/mcp-forzar-consentimiento.ts (el resto es el enchufe de better-auth,
// createAuthMiddleware + matcher, no testeable como unidad sin levantar todo el auth). Se
// prueba aca sin DB ni better-auth, mismo criterio que mcp-gate.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { forzarQueryConsentimiento } from './mcp-forzar-consentimiento.ts';

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
