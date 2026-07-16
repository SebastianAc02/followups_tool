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

test('sin ningun evento: "Sin abrir", frio', () => {
  const r = resumirTracking(vacia, AHORA);
  assert.equal(r.texto, 'Sin abrir');
  assert.equal(r.temperatura, 'frio');
});

test('1 sola apertura: se descarta (posible proxy), sigue frio y sin hora', () => {
  const s: SeñalTracking = { aperturas: 1, clics: 0, ultimaApertura: '2026-07-15T15:59:00.000Z', vioWhatsapp: false };
  const r = resumirTracking(s, AHORA);
  assert.equal(r.texto, 'Sin abrir');
  assert.equal(r.temperatura, 'frio');
});

test('2 aperturas: la primera se descarta, la 2da ya es real -> caliente de una, sin umbral extra', () => {
  const s: SeñalTracking = { aperturas: 2, clics: 0, ultimaApertura: '2026-07-15T14:00:00.000Z', vioWhatsapp: false };
  const r = resumirTracking(s, AHORA);
  assert.equal(r.texto, 'Vio · hace 2h');
  assert.equal(r.temperatura, 'caliente');
});

test('4 aperturas: muestra el conteo REAL (descontando la primera), no el crudo', () => {
  const s: SeñalTracking = { aperturas: 4, clics: 0, ultimaApertura: '2026-07-15T14:00:00.000Z', vioWhatsapp: false };
  const r = resumirTracking(s, AHORA);
  assert.equal(r.texto, 'Vio 3× · hace 2h');
});

test('clic cuenta como real aunque solo haya 1 apertura (la del clic)', () => {
  const s: SeñalTracking = { aperturas: 1, clics: 1, ultimaApertura: '2026-07-15T14:00:00.000Z', vioWhatsapp: false };
  assert.equal(temperaturaDe(s), 'caliente');
});

test('vio WhatsApp es caliente sin ninguna apertura de correo', () => {
  assert.equal(temperaturaDe({ aperturas: 0, clics: 0, ultimaApertura: null, vioWhatsapp: true }), 'caliente');
});
