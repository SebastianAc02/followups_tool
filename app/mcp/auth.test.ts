import test from 'node:test';
import assert from 'node:assert/strict';
import { extraerBearer, tokenDeHeaders, tokenValido } from './auth.ts';

test('extraerBearer: extrae el token de "Bearer X"', () => {
  assert.equal(extraerBearer('Bearer abc123'), 'abc123');
});

test('extraerBearer: case-insensitive en "Bearer"', () => {
  assert.equal(extraerBearer('bearer abc123'), 'abc123');
});

test('extraerBearer: null si no hay header, o si no trae el prefijo', () => {
  assert.equal(extraerBearer(undefined), null);
  assert.equal(extraerBearer('abc123'), null); // sin "Bearer "
});

test('extraerBearer: toma el primer valor si el header llega duplicado (array)', () => {
  assert.equal(extraerBearer(['Bearer uno', 'Bearer dos']), 'uno');
});

test('tokenDeHeaders: prioriza Authorization sobre X-MCP-Token cuando ambos vienen', () => {
  assert.equal(tokenDeHeaders({ authorization: 'Bearer del-header-auth', 'x-mcp-token': 'del-header-plano' }), 'del-header-auth');
});

test('tokenDeHeaders: cae a X-MCP-Token cuando no hay Authorization', () => {
  assert.equal(tokenDeHeaders({ 'x-mcp-token': 'plano-123' }), 'plano-123');
});

test('tokenDeHeaders: null si no viene ninguno de los dos', () => {
  assert.equal(tokenDeHeaders({}), null);
});

test('tokenValido: sin MCP_TOKEN configurado, SIEMPRE false (nunca "modo abierto")', () => {
  assert.equal(tokenValido('cualquier-cosa', undefined), false);
  assert.equal(tokenValido(null, undefined), false);
});

test('tokenValido: con secreto configurado, exige coincidencia exacta', () => {
  assert.equal(tokenValido('secreto-real', 'secreto-real'), true);
  assert.equal(tokenValido('otro-valor', 'secreto-real'), false);
  assert.equal(tokenValido(null, 'secreto-real'), false);
});
