import test from 'node:test';
import assert from 'node:assert/strict';
import { canalesDisponibles, readinessEmpresa } from './canales-empresa.ts';

test('canalesDisponibles: email da correo; telefono da llamada y whatsapp', () => {
  const c = canalesDisponibles([
    { email: 'a@b.co', telefono: null },
    { email: null, telefono: '3001112222' },
  ]);
  assert.deepEqual([...c].sort(), ['correo', 'llamada', 'whatsapp']);
});

test('canalesDisponibles: sin contactos no da ningun canal', () => {
  assert.equal(canalesDisponibles([]).size, 0);
});

test('readiness: tiene todos los canales requeridos -> lista', () => {
  const r = readinessEmpresa(new Set(['correo', 'llamada']), ['correo', 'llamada'], 'cola');
  assert.equal(r.estado, 'lista');
  assert.deepEqual(r.pasosSinCanal, []);
});

test('readiness: le falta el canal de un paso, regla saltar -> parcial y marca el paso', () => {
  const requeridos = [
    { orden: 1, canal: 'correo' as const },
    { orden: 2, canal: 'llamada' as const },
  ];
  const r = readinessEmpresa(new Set(['llamada']), requeridos, 'saltar');
  assert.equal(r.estado, 'parcial');
  assert.deepEqual(r.pasosSinCanal, [1]);
});

test('readiness: sin ningun canal disponible -> sin_canal sin importar la regla', () => {
  const r = readinessEmpresa(new Set(), [{ orden: 1, canal: 'correo' as const }], 'reemplazar');
  assert.equal(r.estado, 'sin_canal');
});

test('readiness: regla reemplazar y hay otro canal -> lista (el paso se reasigna)', () => {
  const r = readinessEmpresa(new Set(['llamada']), [{ orden: 1, canal: 'correo' as const }], 'reemplazar');
  assert.equal(r.estado, 'lista');
  assert.deepEqual(r.reemplazos, [{ orden: 1, de: 'correo', a: 'llamada' }]);
});
