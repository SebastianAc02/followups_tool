// Calcula cuanto tiempo paso una empresa en cada etapa, a partir del historial plano
// que ya guarda empresa_estado_historial (via historialEtapasEmpresa en repository.ts).
// Puro: no lee DB, recibe el historial y un "ahora" explicito (nunca Date.now() adentro).
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularDuracionPorEtapa, calcularCicloVenta } from './tiempoEnEtapa.ts';

test('historial vacio no tiene ventanas', () => {
  const resultado = calcularDuracionPorEtapa({ transiciones: [] }, '2026-06-10T00:00:00.000Z');
  assert.deepEqual(resultado, []);
});

test('cada transicion cierra la ventana de la anterior; la ultima queda abierta contra "ahora"', () => {
  const historial = {
    transiciones: [
      { estado: 'contacto_iniciado', fecha: '2026-06-01T00:00:00.000Z' },
      { estado: 'reunion_agendada', fecha: '2026-06-05T00:00:00.000Z' },
      { estado: 'cierre_documentacion', fecha: '2026-06-08T00:00:00.000Z' },
    ],
  };

  const resultado = calcularDuracionPorEtapa(historial, '2026-06-10T00:00:00.000Z');

  assert.deepEqual(resultado, [
    { estado: 'contacto_iniciado', fechaInicio: '2026-06-01T00:00:00.000Z', fechaFin: '2026-06-05T00:00:00.000Z', dias: 4 },
    { estado: 'reunion_agendada', fechaInicio: '2026-06-05T00:00:00.000Z', fechaFin: '2026-06-08T00:00:00.000Z', dias: 3 },
    { estado: 'cierre_documentacion', fechaInicio: '2026-06-08T00:00:00.000Z', fechaFin: null, dias: 2 },
  ]);
});

test('una sola transicion (lead recien activado) queda como una unica ventana abierta', () => {
  const historial = { transiciones: [{ estado: 'contacto_iniciado', fecha: '2026-06-01T00:00:00.000Z' }] };

  const resultado = calcularDuracionPorEtapa(historial, '2026-06-03T00:00:00.000Z');

  assert.deepEqual(resultado, [
    { estado: 'contacto_iniciado', fechaInicio: '2026-06-01T00:00:00.000Z', fechaFin: null, dias: 2 },
  ]);
});

test('reingresar a la misma etapa dos veces da dos ventanas separadas, no se suman', () => {
  const historial = {
    transiciones: [
      { estado: 'on_hold', fecha: '2026-06-01T00:00:00.000Z' },
      { estado: 'lead', fecha: '2026-06-03T00:00:00.000Z' },
      { estado: 'on_hold', fecha: '2026-06-04T00:00:00.000Z' },
    ],
  };

  const resultado = calcularDuracionPorEtapa(historial, '2026-06-06T00:00:00.000Z');

  assert.equal(resultado.length, 3);
  assert.equal(resultado[0].estado, 'on_hold');
  assert.equal(resultado[0].dias, 2);
  assert.equal(resultado[2].estado, 'on_hold');
  assert.equal(resultado[2].fechaFin, null);
  assert.equal(resultado[2].dias, 2);
});

test('calcularCicloVenta: historial vacio no tiene ciclo', () => {
  assert.equal(calcularCicloVenta({ transiciones: [] }, '2026-06-10T00:00:00.000Z'), null);
});

test('calcularCicloVenta: llega a firma_pago -- ciclo cerrado, medido hasta ese punto', () => {
  const historial = {
    transiciones: [
      { estado: 'contacto_iniciado', fecha: '2026-06-01T00:00:00.000Z' },
      { estado: 'reunion_agendada', fecha: '2026-06-05T00:00:00.000Z' },
      { estado: 'firma_pago', fecha: '2026-06-15T00:00:00.000Z' },
    ],
  };

  const resultado = calcularCicloVenta(historial, '2026-07-01T00:00:00.000Z');

  assert.deepEqual(resultado, { dias: 14, cerrado: true });
});

test('calcularCicloVenta: todavia no cierra -- ciclo en curso medido contra "ahora"', () => {
  const historial = {
    transiciones: [
      { estado: 'contacto_iniciado', fecha: '2026-06-01T00:00:00.000Z' },
      { estado: 'reunion_agendada', fecha: '2026-06-05T00:00:00.000Z' },
    ],
  };

  const resultado = calcularCicloVenta(historial, '2026-06-10T00:00:00.000Z');

  assert.deepEqual(resultado, { dias: 9, cerrado: false });
});

test('calcularCicloVenta: firma_pago que no es la ULTIMA transicion igual cierra el ciclo ahi (no sigue contando)', () => {
  const historial = {
    transiciones: [
      { estado: 'contacto_iniciado', fecha: '2026-06-01T00:00:00.000Z' },
      { estado: 'firma_pago', fecha: '2026-06-10T00:00:00.000Z' },
      { estado: 'on_hold', fecha: '2026-06-20T00:00:00.000Z' },
    ],
  };

  const resultado = calcularCicloVenta(historial, '2026-07-01T00:00:00.000Z');

  assert.deepEqual(resultado, { dias: 9, cerrado: true });
});
