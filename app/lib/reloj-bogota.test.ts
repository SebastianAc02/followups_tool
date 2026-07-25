// El dia del sistema es el de BOGOTA, no el de UTC. Sin esto, entre las 7 pm y la
// medianoche de Colombia la herramienta cree que ya es mañana: los follow-ups del dia
// siguiente entran al conteo como "de hoy", los de hoy se pintan vencidos y el numero del
// home deja de cuadrar con el de la cola. Reportado en vivo el 2026-07-24 a las 21:03 -05
// ("veo 5 pendientes y 9 toques"), que es justo la franja donde UTC ya pasó de dia.
//
// TZ=America/Bogota en el entorno no arregla esto: toISOString() devuelve UTC por contrato,
// ignora TZ. Por eso el dia se formatea con Intl y zona explicita.
//
// El instante se fija con mock.timers para que el resultado no dependa de la hora a la que
// corran los tests. Sin fijarlo, estos casos pasarian de dia y fallarian de noche.
import test from 'node:test';
import assert from 'node:assert/strict';
import { marcarModoPrueba } from './modo-prueba.ts';
import { marcarOffsetDias, hoy } from './reloj.ts';

// Instante real -> dia de calendario que la herramienta debe reportar.
const CASOS = [
  {
    instante: '2026-07-25T02:00:00Z',
    espera: '2026-07-24',
    porque: '21:00 en Bogota: sigue siendo el 24 aunque en UTC ya sea 25',
  },
  {
    instante: '2026-07-24T16:00:00Z',
    espera: '2026-07-24',
    porque: '11:00 en Bogota: de dia el dia coincide con UTC',
  },
  {
    instante: '2026-07-25T04:59:59Z',
    espera: '2026-07-24',
    porque: '23:59:59 en Bogota: ultimo segundo del dia',
  },
  {
    instante: '2026-07-25T05:00:00Z',
    espera: '2026-07-25',
    porque: '00:00 en Bogota: recien ahi cambia el dia',
  },
  {
    instante: '2026-08-01T03:30:00Z',
    espera: '2026-07-31',
    porque: 'cambio de mes: 22:30 del 31 de julio en Bogota',
  },
  {
    instante: '2027-01-01T04:00:00Z',
    espera: '2026-12-31',
    porque: 'cambio de año: 23:00 del 31 de diciembre en Bogota',
  },
];

for (const { instante, espera, porque } of CASOS) {
  test(`hoy() en ${instante} es ${espera} -- ${porque}`, (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date(instante) });
    marcarModoPrueba(false);
    marcarOffsetDias(0);
    assert.equal(hoy(), espera);
  });
}

test('el offset de demo se suma sobre el dia de Bogota, no sobre el de UTC', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-07-25T02:00:00Z') });
  marcarModoPrueba(true);
  marcarOffsetDias(1);
  assert.equal(hoy(), '2026-07-25', 'un dia despues del 24 de Bogota, no dos');
});

test('fuera de modo prueba el offset no aplica, ni cruzando la medianoche UTC', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-07-25T02:00:00Z') });
  marcarModoPrueba(false);
  marcarOffsetDias(5);
  assert.equal(hoy(), '2026-07-24');
});
