// Los cuatro formatos que conviven en toque.fecha (isps.db real, conteo 2026-07-15) mas
// la basura. El caso que disparo esto: el toque de Interccom del 15/07 se pintaba como
// '2026-07-15T16:39:54.808Z' en el riel y no se reconocia como el toque de hoy.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarFechaToque,
  etiquetaFechaToque,
  esToqueDeLaHerramienta,
  parsearFechaTextoEn,
  parsearFechaTextoEs,
} from './fecha-toque.ts';

test('parsearFechaTextoEn entiende el formato del seed de Notion', () => {
  assert.equal(parsearFechaTextoEn('June 18, 2026'), '2026-06-18');
  assert.equal(parsearFechaTextoEn('December 1, 2025'), '2025-12-01');
  assert.equal(parsearFechaTextoEn('2026-06-18'), null);
  assert.equal(parsearFechaTextoEn('Junio 18, 2026'), null);
});

// Sexto formato, encontrado en empresa.proximo_follow_up_fecha (no en toque.fecha): Notion
// exporta la hora cuando el follow-up la tiene ('July 14, 2026 3:30 AM (GMT-5)'). Es el
// mismo dato que 'July 14, 2026' con hora pegada; la hora se descarta, solo importa el dia.
test('parsearFechaTextoEn entiende la hora y zona horaria pegadas (proximo_follow_up_fecha)', () => {
  assert.equal(parsearFechaTextoEn('July 14, 2026 3:30 AM (GMT-5)'), '2026-07-14');
  assert.equal(parsearFechaTextoEn('June 23, 2026 5:00 AM (GMT-5)'), '2026-06-23');
  assert.equal(parsearFechaTextoEn('June 23, 2026 12:00 PM (GMT-5)'), '2026-06-23');
});

// Quinto formato, encontrado corriendo el normalizador contra las 241 filas reales de
// isps.db (no salio de los tests): fechas escritas a mano en Notion, dia primero y mes
// abreviado en español. Eran 8 toques con fecha real yendose a "sin fecha".
test('parsearFechaTextoEs entiende las fechas escritas a mano en Notion', () => {
  assert.equal(parsearFechaTextoEs('24-jun 2026'), '2026-06-24');
  assert.equal(parsearFechaTextoEs('2-jul 2026'), '2026-07-02');
  assert.equal(parsearFechaTextoEs('1-jul 2026'), '2026-07-01');
  assert.equal(parsearFechaTextoEs('~inicios jun'), null); // aproximacion humana, no fecha
  assert.equal(parsearFechaTextoEs('oct-2025 (aprox)'), null); // sin dia, no es un dia
});

test('normalizarFechaToque: la fecha escrita a mano llega hasta el riel', () => {
  assert.deepEqual(normalizarFechaToque('24-jun 2026'), { tipo: 'dia', iso: '2026-06-24' });
  assert.equal(etiquetaFechaToque('2-jul 2026', '2026-07-15'), '2 jul');
});

test('normalizarFechaToque: sin fecha es desconocida, no una fecha inventada', () => {
  assert.deepEqual(normalizarFechaToque(null), { tipo: 'desconocida' });
  assert.deepEqual(normalizarFechaToque(''), { tipo: 'desconocida' });
  assert.deepEqual(normalizarFechaToque('lo que sea'), { tipo: 'desconocida' });
});

test('normalizarFechaToque: fecha sola pasa derecho', () => {
  assert.deepEqual(normalizarFechaToque('2026-06-19'), { tipo: 'dia', iso: '2026-06-19' });
  assert.deepEqual(normalizarFechaToque('  2026-06-19  '), { tipo: 'dia', iso: '2026-06-19' });
});

// Decision: forma correcta no basta, la fecha tiene que existir. 65 filas salieron de un
// importador sin auditar; una fecha imposible es un dato roto, no un dia.
test('normalizarFechaToque: una fecha con forma valida pero imposible es desconocida', () => {
  assert.deepEqual(normalizarFechaToque('2026-13-45'), { tipo: 'desconocida' });
  assert.deepEqual(normalizarFechaToque('2026-02-30'), { tipo: 'desconocida' });
  assert.deepEqual(normalizarFechaToque('June 31, 2026'), { tipo: 'desconocida' });
});

// El ancla de fin importa: sin ella, '2026-06-19-basura' devolveria '2026-06-19' y
// estariamos acertando por accidente sobre un dato que no entendimos.
test('normalizarFechaToque: no acepta cola de basura pegada a una fecha con buena forma', () => {
  assert.deepEqual(normalizarFechaToque('2026-06-19-basura'), { tipo: 'desconocida' });
  assert.deepEqual(normalizarFechaToque('19/06/2026'), { tipo: 'desconocida' });
});

test('normalizarFechaToque: ISO del cockpit se recorta al dia', () => {
  assert.deepEqual(normalizarFechaToque('2026-07-15T16:39:54.808Z'), { tipo: 'dia', iso: '2026-07-15' });
});

test('normalizarFechaToque: texto libre del seed se traduce', () => {
  assert.deepEqual(normalizarFechaToque('June 18, 2026'), { tipo: 'dia', iso: '2026-06-18' });
});

test('etiquetaFechaToque: el toque de hoy se lee "hoy", no un timestamp', () => {
  assert.equal(etiquetaFechaToque('2026-07-15T16:39:54.808Z', '2026-07-15'), 'hoy');
  assert.equal(etiquetaFechaToque('2026-07-14', '2026-07-15'), 'ayer');
});

test('etiquetaFechaToque: fechas viejas van cortas, con año solo si es otro año', () => {
  assert.equal(etiquetaFechaToque('2026-06-19', '2026-07-15'), '19 jun');
  assert.equal(etiquetaFechaToque('June 18, 2026', '2026-07-15'), '18 jun');
  assert.equal(etiquetaFechaToque('2025-12-01', '2026-07-15'), '1 dic 2025');
  assert.equal(etiquetaFechaToque(null, '2026-07-15'), 'sin fecha');
});

test('esToqueDeLaHerramienta lee fuente, no el formato de la fecha', () => {
  assert.equal(esToqueDeLaHerramienta('cockpit'), true);
  assert.equal(esToqueDeLaHerramienta('notion_seed'), false);
  assert.equal(esToqueDeLaHerramienta('notion_toques'), false);
  assert.equal(esToqueDeLaHerramienta(null), false);
});
