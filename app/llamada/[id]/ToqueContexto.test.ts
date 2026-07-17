import test from 'node:test';
import assert from 'node:assert/strict';
import { decidirVista } from './ToqueContexto.ts';
import type { ContextoToque, PasoSecuencia } from '../../db/repository.ts';

function ctxCon(secuencia: PasoSecuencia[]): ContextoToque {
  return {
    emp: undefined,
    principal: null,
    toques: [],
    secuencia,
    objetivo: null,
    idPasoInscripcionActivo: null,
    pbx: null,
    // decidirVista no lo mira (elige vista por la secuencia, no por la inscripcion), pero
    // el tipo lo exige: un contexto de prueba que no compila es un contexto que miente.
    idInscripcionActiva: null,
  };
}

const SIN_SECUENCIA = ctxCon([]);
const CON_PASO_ACTIVO_CORREO = ctxCon([
  { idPaso: 1, orden: 1, diaOffset: 0, canal: 'correo', objetivo: null, estado: 'activo' },
]);

test('decidirVista: ?vista=confirmacion gana siempre', () => {
  assert.equal(decidirVista(SIN_SECUENCIA, { vista: 'confirmacion' }), 'confirmacion');
  assert.equal(decidirVista(CON_PASO_ACTIVO_CORREO, { vista: 'confirmacion' }), 'confirmacion');
});

test('decidirVista: ?vista=correo/whatsapp/llamada explicito, sin paso activo', () => {
  assert.equal(decidirVista(SIN_SECUENCIA, { vista: 'correo' }), 'correo');
  assert.equal(decidirVista(SIN_SECUENCIA, { vista: 'whatsapp' }), 'whatsapp');
  assert.equal(decidirVista(SIN_SECUENCIA, { vista: 'llamada' }), 'llamada');
});

test('decidirVista: sin ?vista=, sin paso activo, cae a llamada', () => {
  assert.equal(decidirVista(SIN_SECUENCIA, {}), 'llamada');
});

test('decidirVista: un paso activo real sigue ganando sobre un ?vista= que no coincide', () => {
  assert.equal(decidirVista(CON_PASO_ACTIVO_CORREO, { vista: 'whatsapp' }), 'correo');
});

test('decidirVista: paso activo sin ?vista= sigue derivando del canal del paso', () => {
  assert.equal(decidirVista(CON_PASO_ACTIVO_CORREO, {}), 'correo');
});
