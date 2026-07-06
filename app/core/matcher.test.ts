import test from 'node:test';
import assert from 'node:assert/strict';
import { agruparCandidatas } from './matcher.ts';
import type { SesionTranscript } from './ports/transcript.ts';

function sesion(over: Partial<SesionTranscript>): SesionTranscript {
  return {
    proveedor: 'granola',
    transcriptId: `t-${Math.random()}`,
    titulo: 'Llamada',
    fecha: '2026-07-04T10:00:00.000Z',
    resumen: 'contenido real',
    url: null,
    ...over,
  };
}

test('dos sesiones con contenido a 20 min se fusionan en una', () => {
  const candidatas = [
    sesion({ transcriptId: 'a', fecha: '2026-07-04T10:00:00.000Z', resumen: 'hola' }),
    sesion({ transcriptId: 'b', fecha: '2026-07-04T10:20:00.000Z', resumen: 'hola mundo, mas largo' }),
  ];
  const resultado = agruparCandidatas(candidatas, '2026-07-04T10:15:00.000Z');
  assert.strictEqual(resultado.length, 1);
  assert.strictEqual(resultado[0].resumen, 'hola mundo, mas largo');
  assert.deepStrictEqual(resultado[0].fusionadaDe.sort(), ['a', 'b']);
});

test('sesion de otro dia no entra como candidata', () => {
  const candidatas = [sesion({ fecha: '2026-07-01T10:00:00.000Z' })];
  const resultado = agruparCandidatas(candidatas, '2026-07-04T10:15:00.000Z');
  assert.strictEqual(resultado.length, 0);
});

test('sesiones sin contenido real se descartan, nunca se muestran para confirmar', () => {
  const candidatas = [sesion({ fecha: '2026-07-04T10:00:00.000Z', resumen: '' }), sesion({ fecha: '2026-07-04T10:05:00.000Z', resumen: null })];
  const resultado = agruparCandidatas(candidatas, '2026-07-04T10:15:00.000Z');
  assert.strictEqual(resultado.length, 0);
});

test('dos llamadas reales distintas a mas de 1 hora quedan separadas, ordenadas por cercania', () => {
  const candidatas = [
    sesion({ transcriptId: 'lejos', fecha: '2026-07-04T08:00:00.000Z', resumen: 'primera llamada' }),
    sesion({ transcriptId: 'cerca', fecha: '2026-07-04T10:10:00.000Z', resumen: 'segunda llamada' }),
  ];
  const resultado = agruparCandidatas(candidatas, '2026-07-04T10:15:00.000Z');
  assert.strictEqual(resultado.length, 2);
  assert.strictEqual(resultado[0].transcriptId, 'cerca');
  assert.strictEqual(resultado[1].transcriptId, 'lejos');
});

test('caso real: intento fallido y llamada real minutos despues no se fusionan (uno no tiene contenido)', () => {
  const candidatas = [
    sesion({ transcriptId: 'fallido', fecha: '2026-07-04T10:00:00.000Z', resumen: '' }),
    sesion({ transcriptId: 'real', fecha: '2026-07-04T10:11:00.000Z', resumen: 'llamada de verdad' }),
  ];
  const resultado = agruparCandidatas(candidatas, '2026-07-04T10:15:00.000Z');
  assert.strictEqual(resultado.length, 1);
  assert.strictEqual(resultado[0].transcriptId, 'real');
});
