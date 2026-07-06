import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmarTranscript, type ConfirmarTranscriptDeps } from './confirmarTranscript.ts';
import type { SesionTranscript } from './ports/transcript.ts';

function depsFalsos(estadoInicial: { transcriptId: string | null; quePaso: string | null }) {
  const estado = { ...estadoInicial };
  const deps: ConfirmarTranscriptDeps = {
    leerToque: () => ({ transcriptId: estado.transcriptId }),
    escribirCompleto: (_idToque, sesion) => {
      estado.transcriptId = sesion.transcriptId;
      estado.quePaso = sesion.resumen;
    },
    escribirSoloPuntero: (_idToque, sesion) => {
      estado.transcriptId = sesion.transcriptId;
      // quePaso NO se toca -- ese es justo el punto de esta rama.
    },
  };
  return { deps, estado };
}

const sesionBase: SesionTranscript = {
  proveedor: 'granola',
  transcriptId: 't-1',
  titulo: 'Redes del Norte',
  fecha: '2026-07-04T10:00:00.000Z',
  resumen: 'hablamos de precios',
  url: null,
};

test('primera confirmacion escribe todo, incluido que_paso', () => {
  const { deps, estado } = depsFalsos({ transcriptId: null, quePaso: null });
  confirmarTranscript(1, sesionBase, deps);
  assert.strictEqual(estado.transcriptId, 't-1');
  assert.strictEqual(estado.quePaso, 'hablamos de precios');
});

test('confirmar dos veces la misma sesion no duplica nada, solo actualiza el puntero', () => {
  const { deps, estado } = depsFalsos({ transcriptId: null, quePaso: null });
  confirmarTranscript(1, sesionBase, deps);
  confirmarTranscript(1, sesionBase, deps);
  assert.strictEqual(estado.transcriptId, 't-1');
});

test('que_paso editado a mano no se pisa en una reconfirmacion de la MISMA grabacion', () => {
  const { deps, estado } = depsFalsos({ transcriptId: null, quePaso: null });
  confirmarTranscript(1, sesionBase, deps);
  estado.quePaso = 'edite esto a mano'; // simula edicion humana entre confirmaciones
  confirmarTranscript(1, { ...sesionBase, resumen: 'resumen nuevo de granola' }, deps);
  assert.strictEqual(estado.quePaso, 'edite esto a mano');
});

test('confirmar una grabacion DISTINTA si escribe el nuevo que_paso', () => {
  const { deps, estado } = depsFalsos({ transcriptId: 't-1', quePaso: 'texto viejo' });
  confirmarTranscript(1, { ...sesionBase, transcriptId: 't-2', resumen: 'otra llamada distinta' }, deps);
  assert.strictEqual(estado.transcriptId, 't-2');
  assert.strictEqual(estado.quePaso, 'otra llamada distinta');
});
