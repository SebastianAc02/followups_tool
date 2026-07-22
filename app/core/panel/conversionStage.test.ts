import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularConversionStage, type EmpresaFunnelInput } from './conversionStage.ts';

const ORDEN = ['lead', 'contacto_iniciado', 'reunion_agendada', 'oportunidad'] as const;

test('funnel simple: cada etapa pierde deals, conversion decreciente', () => {
  const empresas: EmpresaFunnelInput[] = [
    { idEmpresa: 'a', estadoActual: 'oportunidad', estadosHistorial: [] },
    { idEmpresa: 'b', estadoActual: 'reunion_agendada', estadosHistorial: [] },
    { idEmpresa: 'c', estadoActual: 'contacto_iniciado', estadosHistorial: [] },
    { idEmpresa: 'd', estadoActual: 'lead', estadosHistorial: [] },
  ];
  // llegaron: lead=4, contacto=3, reunion=2, oportunidad=1
  assert.deepEqual(calcularConversionStage(empresas, ORDEN), {
    'lead→contacto_iniciado': 0.75,
    'contacto_iniciado→reunion_agendada': 0.667, // Math.round((2/3) * 1000) / 1000
    'reunion_agendada→oportunidad': 0.5,
  });
});

test('high-water-mark: una empresa que retrocedio a lead conserva el credito de lo que alcanzo', () => {
  // Reversion real observada en produccion: oportunidad -> lead. La empresa SI llego a
  // reunion_agendada/oportunidad alguna vez (esta en su historial), aunque hoy este en lead.
  const empresas: EmpresaFunnelInput[] = [
    {
      idEmpresa: 'a',
      estadoActual: 'lead',
      estadosHistorial: ['contacto_iniciado', 'reunion_agendada', 'oportunidad', 'lead'],
    },
  ];
  assert.deepEqual(calcularConversionStage(empresas, ORDEN), {
    'lead→contacto_iniciado': 1,
    'contacto_iniciado→reunion_agendada': 1,
    'reunion_agendada→oportunidad': 1,
  });
});

test('etapa con 0 deals: el par se omite, no se inventa un 0/0', () => {
  const empresas: EmpresaFunnelInput[] = [
    { idEmpresa: 'a', estadoActual: 'lead', estadosHistorial: [] },
  ];
  // Nadie llego a contacto_iniciado -> ese denominador es 0 -> el par
  // contacto_iniciado->reunion_agendada se omite (no hay como medirlo).
  const out = calcularConversionStage(empresas, ORDEN);
  assert.deepEqual(out, { 'lead→contacto_iniciado': 0 });
  assert.ok(!('contacto_iniciado→reunion_agendada' in out));
  assert.ok(!('reunion_agendada→oportunidad' in out));
});

test('0% real se reporta explicito cuando SI hubo deals en la etapa origen', () => {
  const empresas: EmpresaFunnelInput[] = [
    { idEmpresa: 'a', estadoActual: 'contacto_iniciado', estadosHistorial: [] },
    { idEmpresa: 'b', estadoActual: 'contacto_iniciado', estadosHistorial: [] },
  ];
  const out = calcularConversionStage(empresas, ORDEN);
  assert.equal(out['contacto_iniciado→reunion_agendada'], 0);
});

test('empresa sin estado y sin historial no cuenta para ninguna etapa', () => {
  const empresas: EmpresaFunnelInput[] = [
    { idEmpresa: 'a', estadoActual: null, estadosHistorial: [] },
    { idEmpresa: 'b', estadoActual: 'oportunidad', estadosHistorial: [] },
  ];
  assert.deepEqual(calcularConversionStage(empresas, ORDEN), {
    'lead→contacto_iniciado': 1,
    'contacto_iniciado→reunion_agendada': 1,
    'reunion_agendada→oportunidad': 1,
  });
});

test('estado fuera del funnel (on_hold) no rompe ni participa si no esta en ordenEtapas', () => {
  const empresas: EmpresaFunnelInput[] = [
    { idEmpresa: 'a', estadoActual: 'on_hold', estadosHistorial: ['reunion_agendada'] },
  ];
  // on_hold no esta en ORDEN: se ignora como etapa actual, pero el historial SI la
  // acredita para reunion_agendada (y todo lo anterior).
  assert.deepEqual(calcularConversionStage(empresas, ORDEN), {
    'lead→contacto_iniciado': 1,
    'contacto_iniciado→reunion_agendada': 1,
    'reunion_agendada→oportunidad': 0,
  });
});

test('sin empresas, no hay pares (objeto vacio, no sin_datos)', () => {
  assert.deepEqual(calcularConversionStage([], ORDEN), {});
});
