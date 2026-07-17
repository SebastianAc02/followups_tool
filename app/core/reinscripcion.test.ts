import { todo } from 'node:test';
import assert from 'node:assert/strict';
import { puedeVolverAInscribirse } from './reinscripcion.ts';

// TODOS en todo() a proposito, no por descuido: puedeVolverAInscribirse todavia no tiene
// cuerpo porque la regla es de negocio y la escribe Sebastián (ver el bloque TODO en
// reinscripcion.ts). En todo() y no en test() para que el gate siga verde y el boton
// "Sacar de la cadencia" -- que NO necesita esta regla, sacar siempre se puede -- pueda
// desplegarse hoy sin esperar la decision.
//
// Cuando Sebastián escriba la regla: los 5 primeros pasan a test() tal cual estan (los
// casos ya los decidio el 2026-07-17), y los 2 ultimos se escriben con lo que decida.
// Recien ahi se cablea "Volver a meter" en la UI. Mismo patron que puedeResolverBloqueada.

todo('pausada + manual: SI, es el caso que la feature existe para servir', () => {
  assert.equal(puedeVolverAInscribirse('pausada', 'manual'), true);
});

todo('pausada + respuesta: NO, ya hay conversacion viva', () => {
  assert.equal(puedeVolverAInscribirse('pausada', 'respuesta'), false);
});

todo('pausada + rebote: NO, el correo no existe', () => {
  assert.equal(puedeVolverAInscribirse('pausada', 'rebote'), false);
});

todo('pausada + null (dato viejo): NO, no sabemos por que se pauso', () => {
  assert.equal(puedeVolverAInscribirse('pausada', null), false);
});

todo('activa: NO, no hay nada que revertir', () => {
  assert.equal(puedeVolverAInscribirse('activa', null), false);
});

todo('finalizada: ¿se puede re-atacar una cadencia que corrio completa? Falta la regla de Sebastián', () => {
  // Ojo al escribirlo: ux_inscripcion_activa es un indice unico parcial ("una activa por
  // empresa"). Reactivar una finalizada mientras otra campana tiene a esa empresa activa
  // revienta contra el indice, asi que si la respuesta es SI, el caller tiene que mirar
  // eso antes de escribir.
  assert.fail('falta decidir');
});

todo('bloqueada: ¿ofrece reversa, o es otro flujo (Por revisar)? Falta la regla de Sebastián', () => {
  assert.fail('falta decidir');
});
