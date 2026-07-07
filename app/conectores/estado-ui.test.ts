// Mapeos puros de EstadoConector -> vista (label + severidad del punto) y conteo agregado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { vistaEstado, contarEstados } from './estado-ui.ts';
import type { EstadoConector } from '../db/repository.ts';

const base: EstadoConector = { tieneCredencial: true, estado: 'activo', ultimaCorrida: null, ultimoResultado: null };

test('sin credencial -> Sin configurar / faint', () => {
  assert.deepEqual(vistaEstado({ ...base, tieneCredencial: false }), { label: 'Sin configurar', sev: 'faint' });
});

test('ultimoResultado error -> Caido / overdue', () => {
  assert.deepEqual(vistaEstado({ ...base, ultimoResultado: 'error 401' }), { label: 'Caído', sev: 'overdue' });
});

test('ultimoResultado ok -> Vivo / done', () => {
  assert.deepEqual(vistaEstado({ ...base, ultimoResultado: 'ok' }), { label: 'Vivo', sev: 'done' });
});

test('con credencial sin corridas -> Configurado / today', () => {
  assert.deepEqual(vistaEstado(base), { label: 'Configurado', sev: 'today' });
});

test('contarEstados agrega por categoria', () => {
  const vistas = [
    { label: 'Vivo', sev: 'done' as const },
    { label: 'Caído', sev: 'overdue' as const },
    { label: 'Configurado', sev: 'today' as const },
    { label: 'Sin configurar', sev: 'faint' as const },
    { label: 'Vivo', sev: 'done' as const },
  ];
  assert.deepEqual(contarEstados(vistas), { vivo: 2, caido: 1, espera: 1, sinConfigurar: 1 });
});
