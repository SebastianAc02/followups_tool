// Quien puede volver a la cadencia despues de que la sacaron. Los cinco primeros casos los
// decidio Sebastian el 2026-07-17; los dos ultimos los cerro Claude el 2026-07-25 por
// restriccion de tiempo explicita, y el porque de cada uno esta en reinscripcion.ts.
//
// Lo que estos tests protegen es la asimetria: el unico SI es el que Sebastian pidio, y todo
// lo demas es NO. Aflojar cualquiera de los NO reintroduce el error caro (mandarle cadencia
// automatica a alguien que ya esta hablando con nosotros).
import test from 'node:test';
import assert from 'node:assert/strict';
import { puedeVolverAInscribirse } from './reinscripcion.ts';

test('pausada + manual: SI, es el caso que la feature existe para servir', () => {
  assert.equal(puedeVolverAInscribirse('pausada', 'manual'), true);
});

test('pausada + respuesta: NO, ya hay conversacion viva', () => {
  assert.equal(puedeVolverAInscribirse('pausada', 'respuesta'), false);
});

test('pausada + rebote: NO, el correo no existe', () => {
  assert.equal(puedeVolverAInscribirse('pausada', 'rebote'), false);
});

test('pausada + null (dato viejo): NO, no sabemos por que se pauso', () => {
  assert.equal(puedeVolverAInscribirse('pausada', null), false);
});

test('activa: NO, no hay nada que revertir', () => {
  assert.equal(puedeVolverAInscribirse('activa', null), false);
});

// Decision de Claude, 2026-07-25. El motivo es de esquema, no de gusto: ux_inscripcion_activa
// es un indice unico parcial ("una activa por empresa"), asi que reactivar una finalizada
// mientras otra campana tiene viva a esa empresa revienta contra el indice. Se re-ataca
// inscribiendola en una campana nueva, que ademas deja rastro del segundo intento.
test('finalizada: NO, una cadencia que corrio completa es historia cerrada', () => {
  assert.equal(puedeVolverAInscribirse('finalizada', 'manual'), false);
  assert.equal(puedeVolverAInscribirse('finalizada', null), false);
  assert.equal(puedeVolverAInscribirse('finalizada', 'respuesta'), false);
});

// Decision de Claude, 2026-07-25. 'bloqueada' no es una baja: es una inscripcion esperando que
// le elijan contacto en "Por revisar". Ofrecer reversa aca mezcla dos flujos distintos.
test('bloqueada: NO, eso se resuelve en Por revisar, no con la reversa', () => {
  assert.equal(puedeVolverAInscribirse('bloqueada', 'manual'), false);
  assert.equal(puedeVolverAInscribirse('bloqueada', null), false);
});

// El SI es exactamente uno. Si este test se cae, alguien amplio la regla sin discutirla.
test('el unico SI de toda la matriz es pausada + manual', () => {
  const estados = ['activa', 'pausada', 'bloqueada', 'finalizada'] as const;
  const origenes = ['respuesta', 'manual', 'rebote', null] as const;
  const sies = estados.flatMap((e) =>
    origenes.filter((o) => puedeVolverAInscribirse(e, o)).map((o) => `${e}+${o}`),
  );
  assert.deepEqual(sies, ['pausada+manual']);
});
