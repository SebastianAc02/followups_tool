// El cable que se me quedo suelto (2026-07-15): las paginas RSC leian hoy() con el offset
// del reloj de demo, pero tareaMaterializar seguia con new Date() crudo. Resultado: el
// banner decia "Dia simulado: 2026-07-17" y el materializador calculaba contra 2026-07-16,
// asi que el paso debido para el 17 nunca se materializaba. Sebastian le daba a "Siguiente
// dia" y no pasaba nada -- la mitad del sistema creia que era mañana y la otra sabia que era
// hoy.
//
// Este test fija el contrato de la fecha, que es lo unico que importa: si estas en modo
// prueba con offset, materializar tiene que recibir el dia SIMULADO; si no, el real.
import test from 'node:test';
import assert from 'node:assert/strict';
import { marcarModoPrueba } from '../lib/modo-prueba.ts';
import { marcarOffsetDias, hoy } from '../lib/reloj.ts';

function hoyReal(): string {
  return new Date().toISOString().slice(0, 10);
}

function masDias(dias: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

test('en modo prueba con offset, el materializador recibe el dia SIMULADO', () => {
  marcarModoPrueba(true);
  marcarOffsetDias(1);
  assert.equal(hoy(), masDias(1), 'sin esto, "Siguiente dia" no materializa nada');
});

test('el worker (sin modo prueba) sigue viendo la fecha REAL', () => {
  marcarModoPrueba(false);
  marcarOffsetDias(5); // aunque alguien haya marcado un offset: fuera de prueba no aplica
  assert.equal(hoy(), hoyReal(), 'el offset jamas puede filtrarse al worker de produccion');
});

test('en modo prueba sin offset, es la fecha real', () => {
  marcarModoPrueba(true);
  marcarOffsetDias(0);
  assert.equal(hoy(), hoyReal());
});
