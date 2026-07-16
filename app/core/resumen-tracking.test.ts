import test from 'node:test';
import assert from 'node:assert/strict';
import { haceCuanto, resumirTracking, temperaturaDe, type SeñalTracking } from './resumen-tracking.ts';

const AHORA = new Date('2026-07-15T16:00:00.000Z');
const vacia: SeñalTracking = { aperturas: 0, clics: 0, ultimaApertura: null, vioWhatsapp: false };

test('haceCuanto: minutos, horas, dias', () => {
  assert.equal(haceCuanto('2026-07-15T15:59:40.000Z', AHORA), 'recién');
  assert.equal(haceCuanto('2026-07-15T15:30:00.000Z', AHORA), 'hace 30m');
  assert.equal(haceCuanto('2026-07-15T14:00:00.000Z', AHORA), 'hace 2h');
  assert.equal(haceCuanto('2026-07-13T16:00:00.000Z', AHORA), 'hace 2d');
});

test('resumirTracking: 3 aperturas + clic', () => {
  const s: SeñalTracking = { aperturas: 3, clics: 1, ultimaApertura: '2026-07-15T14:00:00.000Z', vioWhatsapp: false };
  const r = resumirTracking(s, AHORA);
  assert.equal(r.texto, 'Abrió 3× · hizo clic · hace 2h');
  assert.equal(r.temperatura, 'caliente');
});

test('resumirTracking: sin nada abre "Sin abrir"', () => {
  assert.equal(resumirTracking(vacia, AHORA).texto, 'Sin abrir');
  assert.equal(temperaturaDe(vacia), 'frio');
});

test('temperaturaDe: clic solo ya es caliente aunque no haya aperturas', () => {
  assert.equal(temperaturaDe({ aperturas: 0, clics: 1, ultimaApertura: null, vioWhatsapp: false }), 'caliente');
});

test('temperaturaDe: vio WhatsApp es caliente', () => {
  assert.equal(temperaturaDe({ aperturas: 0, clics: 0, ultimaApertura: null, vioWhatsapp: true }), 'caliente');
});

test('temperaturaDe: 1 apertura sola es frio (indistinguible del proxy)', () => {
  assert.equal(temperaturaDe({ aperturas: 1, clics: 0, ultimaApertura: '2026-07-15T15:59:00.000Z', vioWhatsapp: false }), 'frio');
});

test('temperaturaDe: 2+ aperturas sin clic es tibio', () => {
  assert.equal(temperaturaDe({ aperturas: 2, clics: 0, ultimaApertura: '2026-07-15T15:59:00.000Z', vioWhatsapp: false }), 'tibio');
});
