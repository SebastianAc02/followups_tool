import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dentroDeVentana,
  esperaEntreMensajes,
  VENTANA_DEFAULT,
  ESPACIADO_WHATSAPP_DEFAULT,
  type VentanaEnvio,
} from './ventana-envio.ts';

// Colombia es UTC-5 todo el año (sin horario de verano). Las fechas de abajo se escriben
// en UTC (Z) y el comentario dice la hora Colombia que representan.
const V: VentanaEnvio = VENTANA_DEFAULT;

test('dentro de la ventana en horario laboral de un dia habil', () => {
  // 2026-07-16 es jueves. 15:00Z = 10:00 Colombia.
  assert.equal(dentroDeVentana(new Date('2026-07-16T15:00:00.000Z'), V).puede, true);
});

test('fuera de la ventana a las 2am (el caso que Sebastian pidio evitar)', () => {
  // 07:00Z = 02:00 Colombia.
  const r = dentroDeVentana(new Date('2026-07-16T07:00:00.000Z'), V);
  assert.equal(r.puede, false);
  assert.match(r.motivo, /02:00/);
});

test('el borde de apertura ya cuenta como dentro', () => {
  // 13:00Z = 08:00 Colombia exacto.
  assert.equal(dentroDeVentana(new Date('2026-07-16T13:00:00.000Z'), V).puede, true);
});

test('el borde de cierre ya cuenta como fuera', () => {
  // 23:00Z = 18:00 Colombia exacto. La ventana es [8, 18): a las 18:00 ya no se manda.
  assert.equal(dentroDeVentana(new Date('2026-07-16T23:00:00.000Z'), V).puede, false);
});

test('sabado y domingo estan fuera aunque sea media manana', () => {
  // 2026-07-18 sabado, 2026-07-19 domingo. 15:00Z = 10:00 Colombia.
  assert.equal(dentroDeVentana(new Date('2026-07-18T15:00:00.000Z'), V).puede, false);
  assert.equal(dentroDeVentana(new Date('2026-07-19T15:00:00.000Z'), V).puede, false);
});

test('la conversion de zona cruza bien el dia: 03:00Z del viernes es jueves 22:00 Colombia', () => {
  // Viernes 2026-07-17 03:00Z = jueves 2026-07-16 22:00 Colombia -> dia habil pero fuera de hora.
  const r = dentroDeVentana(new Date('2026-07-17T03:00:00.000Z'), V);
  assert.equal(r.puede, false);
  assert.match(r.motivo, /22:00/);
});

test('la conversion de zona cruza bien el dia: lunes 03:00Z es domingo en Colombia', () => {
  // Lunes 2026-07-20 03:00Z = domingo 2026-07-19 22:00 Colombia -> dia bloqueado.
  const r = dentroDeVentana(new Date('2026-07-20T03:00:00.000Z'), V);
  assert.equal(r.puede, false);
  assert.match(r.motivo, /domingo/i);
});

test('una ventana sin dias bloqueados deja mandar el sabado', () => {
  const sinBloqueo: VentanaEnvio = { ...V, diasBloqueados: [] };
  assert.equal(dentroDeVentana(new Date('2026-07-18T15:00:00.000Z'), sinBloqueo).puede, true);
});

// Espaciado con jitter: rand se inyecta para que el test sea determinista (mismo patron
// que `ahora` en el resto del core).
test('esperaEntreMensajes respeta el rango y usa el jitter', () => {
  const { minMs, maxMs } = ESPACIADO_WHATSAPP_DEFAULT;
  assert.equal(esperaEntreMensajes(ESPACIADO_WHATSAPP_DEFAULT, () => 0), minMs, 'rand=0 -> el minimo');
  const medio = esperaEntreMensajes(ESPACIADO_WHATSAPP_DEFAULT, () => 0.5);
  assert.equal(medio, minMs + (maxMs - minMs) / 2, 'rand=0.5 -> la mitad del rango');
});

test('esperaEntreMensajes nunca sale del rango con cualquier rand', () => {
  const { minMs, maxMs } = ESPACIADO_WHATSAPP_DEFAULT;
  for (const r of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 0.9999]) {
    const ms = esperaEntreMensajes(ESPACIADO_WHATSAPP_DEFAULT, () => r);
    assert.ok(ms >= minMs && ms <= maxMs, `rand=${r} dio ${ms}, fuera de [${minMs}, ${maxMs}]`);
  }
});

test('el default de WhatsApp es 45-90s (anti-ban, no un intervalo fijo robotico)', () => {
  assert.equal(ESPACIADO_WHATSAPP_DEFAULT.minMs, 45_000);
  assert.equal(ESPACIADO_WHATSAPP_DEFAULT.maxMs, 90_000);
});
