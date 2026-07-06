// Sanity del puerto: cualquier consumidor que reciba un TranscriptAdapter funciona
// con un doble en memoria, sin tocar Granola. El matcher real (V3.4) es el consumidor
// de produccion; este test solo prueba que el contrato es usable.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { TranscriptAdapter, SesionTranscript } from './transcript.ts';

function granolaFalso(sesiones: SesionTranscript[]): TranscriptAdapter {
  return {
    async buscarCandidatas(terminos, desde, hasta) {
      return sesiones.filter(
        (s) => s.fecha >= desde && s.fecha <= hasta && terminos.some((t) => `${s.titulo} ${s.resumen ?? ''}`.includes(t)),
      );
    },
  };
}

test('un consumidor puede pedir candidatas sin saber que hay detras del puerto', async () => {
  const sesion: SesionTranscript = {
    proveedor: 'granola',
    transcriptId: 't-1',
    titulo: 'Redes del Norte - Llamada 04.07.2026',
    fecha: '2026-07-04T10:00:00.000Z',
    resumen: 'hablamos de precios',
    url: null,
  };
  const adapter = granolaFalso([sesion]);

  const candidatas = await adapter.buscarCandidatas(['Redes del Norte'], '2026-07-04T00:00:00.000Z', '2026-07-04T23:59:59.000Z');

  assert.strictEqual(candidatas.length, 1);
  assert.strictEqual(candidatas[0].resumen, 'hablamos de precios');
});

test('fuera de la ventana de tiempo no aparece como candidata', async () => {
  const sesion: SesionTranscript = {
    proveedor: 'granola',
    transcriptId: 't-2',
    titulo: 'Redes del Norte - Llamada otro dia',
    fecha: '2026-07-01T10:00:00.000Z',
    resumen: 'otra cosa',
    url: null,
  };
  const adapter = granolaFalso([sesion]);

  const candidatas = await adapter.buscarCandidatas(['Redes del Norte'], '2026-07-04T00:00:00.000Z', '2026-07-04T23:59:59.000Z');

  assert.strictEqual(candidatas.length, 0);
});

test('ningun termino coincide, no hay candidatas aunque este en la ventana', async () => {
  const sesion: SesionTranscript = {
    proveedor: 'granola',
    transcriptId: 't-3',
    titulo: 'Otra Empresa SAS - Llamada',
    fecha: '2026-07-04T10:00:00.000Z',
    resumen: 'no tiene relacion',
    url: null,
  };
  const adapter = granolaFalso([sesion]);

  const candidatas = await adapter.buscarCandidatas(['Redes del Norte'], '2026-07-04T00:00:00.000Z', '2026-07-04T23:59:59.000Z');

  assert.strictEqual(candidatas.length, 0);
});
