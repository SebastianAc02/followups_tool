// Pregunta del operador (dictada 2026-08-05): "cuantas llamadas me toma una reunion si viene
// un call, y cuantas llamadas me toma una reunion si viene el lead". El agregado de
// llamadasPorReunionConseguida (dashboard-cro.ts) esconde que prospectar en frio y atender un
// inbound no cuestan lo mismo -- esta funcion parte ese costo por origenLead.
//
// La regla que fija esta prueba antes que ninguna otra (ver el bloque marcado abajo): una
// cuenta SIN origen registrado no es outbound. Hoy la columna esta vacia en las 1.956 filas de
// produccion, asi que meter el vacio en outbound (la mayoria de la prospeccion es fria)
// corromperia justo la comparacion para la que esta metrica existe.
import test from 'node:test';
import assert from 'node:assert/strict';
import { conversionPorOrigen, type ToqueConOrigen } from './conversion-origen.ts';

// ── helper de fixture ───────────────────────────────────────────────────────────
function toque(overrides: Partial<ToqueConOrigen> = {}): ToqueConOrigen {
  return {
    idEmpresa: 'emp-1',
    canal: 'llamada',
    resultado: null,
    fuente: 'cockpit',
    origenLead: 'outbound',
    reunionFechaPropuesta: null,
    ...overrides,
  };
}

// ── cero toques ──────────────────────────────────────────────────────────────────

test('conversionPorOrigen: cero toques da todo en cero/vacio, sin inventar grupos', () => {
  const r = conversionPorOrigen([]);
  assert.deepEqual(r.porOrigen, []);
  assert.deepEqual(r.agregado, { origen: '__agregado__', llamadas: 0, reunionesConseguidas: 0, llamadasPorReunion: null });
  assert.deepEqual(r.cobertura, { cuentasConOrigen: 0, cuentasSinOrigen: 0, totalCuentas: 0, fraccion: null });
  assert.deepEqual(r.cuentasInconsistentes, []);
});

// ── LA PRUEBA MAS IMPORTANTE: sin_registrar nunca se reparte a outbound ─────────────────────

test('conversionPorOrigen: una cuenta sin origen registrado cae en sin_registrar, NUNCA en outbound', () => {
  const toques: ToqueConOrigen[] = [
    // dos cuentas outbound reales, cada una con una llamada y su reunion conseguida
    toque({ idEmpresa: 'emp-out-1', origenLead: 'outbound', canal: 'llamada', reunionFechaPropuesta: '2026-07-01' }),
    toque({ idEmpresa: 'emp-out-2', origenLead: 'outbound', canal: 'llamada' }),
    // una cuenta sin origen registrado, con volumen de llamadas alto -- si se colara a
    // outbound le bajaria la tasa de llamadasPorReunion sin que el dato lo sostenga
    toque({ idEmpresa: 'emp-sin-1', origenLead: null, canal: 'llamada' }),
    toque({ idEmpresa: 'emp-sin-1', origenLead: null, canal: 'llamada' }),
    toque({ idEmpresa: 'emp-sin-1', origenLead: null, canal: 'llamada' }),
  ];
  const r = conversionPorOrigen(toques);

  const outbound = r.porOrigen.find((g) => g.origen === 'outbound');
  assert.ok(outbound, 'outbound debe existir como grupo');
  assert.equal(outbound!.llamadas, 2, 'las 3 llamadas de emp-sin-1 no deben sumar a outbound');
  assert.equal(outbound!.reunionesConseguidas, 1);
  assert.equal(outbound!.llamadasPorReunion, 2);

  const sinRegistrar = r.porOrigen.find((g) => g.origen === 'sin_registrar');
  assert.ok(sinRegistrar, 'sin_registrar debe existir como su propio grupo');
  assert.equal(sinRegistrar!.llamadas, 3);
  assert.equal(sinRegistrar!.reunionesConseguidas, 0);
  assert.equal(sinRegistrar!.llamadasPorReunion, null, 'cero reuniones es null, no 0 ni Infinity');

  // ningun otro grupo (p.ej. 'inbound') aparece inventado
  assert.equal(r.porOrigen.length, 2);
});

test('conversionPorOrigen: todas las cuentas sin origen -- cobertura en cero, todo cae en sin_registrar', () => {
  const toques: ToqueConOrigen[] = [
    toque({ idEmpresa: 'emp-1', origenLead: null, canal: 'llamada', reunionFechaPropuesta: '2026-07-01' }),
    toque({ idEmpresa: 'emp-2', origenLead: null, canal: 'llamada' }),
    toque({ idEmpresa: 'emp-3', origenLead: null, canal: 'whatsapp' }),
  ];
  const r = conversionPorOrigen(toques);

  assert.equal(r.porOrigen.length, 1);
  assert.equal(r.porOrigen[0].origen, 'sin_registrar');
  assert.equal(r.porOrigen[0].llamadas, 2);
  assert.equal(r.porOrigen[0].reunionesConseguidas, 1);
  assert.equal(r.porOrigen[0].llamadasPorReunion, 2);

  assert.deepEqual(r.cobertura, { cuentasConOrigen: 0, cuentasSinOrigen: 3, totalCuentas: 3, fraccion: 0 });
});

// ── un origen con llamadas y cero reuniones ─────────────────────────────────────────────────

test('conversionPorOrigen: un origen con llamadas y cero reuniones da llamadasPorReunion null', () => {
  const toques: ToqueConOrigen[] = [
    toque({ idEmpresa: 'emp-1', origenLead: 'evento', canal: 'llamada' }),
    toque({ idEmpresa: 'emp-1', origenLead: 'evento', canal: 'llamada' }),
  ];
  const r = conversionPorOrigen(toques);
  const evento = r.porOrigen.find((g) => g.origen === 'evento')!;
  assert.equal(evento.llamadas, 2);
  assert.equal(evento.reunionesConseguidas, 0);
  assert.equal(evento.llamadasPorReunion, null);
});

// ── llamadas excluye entrantes de whatsapp aunque el canal diga 'llamada' ───────────────────

test('conversionPorOrigen: un entrante de whatsapp nunca cuenta como llamada', () => {
  const toques: ToqueConOrigen[] = [
    toque({ idEmpresa: 'emp-1', origenLead: 'inbound', canal: 'llamada', fuente: 'whatsapp_entrante' }),
    toque({ idEmpresa: 'emp-1', origenLead: 'inbound', canal: 'llamada', fuente: 'cockpit' }),
  ];
  const r = conversionPorOrigen(toques);
  const inbound = r.porOrigen.find((g) => g.origen === 'inbound')!;
  assert.equal(inbound.llamadas, 1);
});

// ── reunionesConseguidas usa el MISMO criterio que llamadasPorReunionConseguida ─────────────

test('conversionPorOrigen: reunionesConseguidas cuenta reunionFechaPropuesta sin filtrar por canal ni fuente', () => {
  const toques: ToqueConOrigen[] = [
    // canal whatsapp con reunion propuesta: cuenta igual, mismo criterio que dashboard-cro
    toque({ idEmpresa: 'emp-1', origenLead: 'referido', canal: 'whatsapp', reunionFechaPropuesta: '2026-07-05' }),
  ];
  const r = conversionPorOrigen(toques);
  const referido = r.porOrigen.find((g) => g.origen === 'referido')!;
  assert.equal(referido.reunionesConseguidas, 1);
  assert.equal(referido.llamadas, 0);
  // null es solo cuando el DENOMINADOR (reuniones) es cero -- con una reunion conseguida a
  // costo de cero llamadas, 0 es el numero real, no un caso sin dato.
  assert.equal(referido.llamadasPorReunion, 0);
});

// ── cuenta con origenes contradictorios entre toques: se reporta, no se promedia ────────────

test('conversionPorOrigen: origenes contradictorios en la misma cuenta se reportan aparte y no corrompen ningun grupo', () => {
  const toques: ToqueConOrigen[] = [
    toque({ idEmpresa: 'emp-mix', origenLead: 'outbound', canal: 'llamada' }),
    toque({ idEmpresa: 'emp-mix', origenLead: 'inbound', canal: 'llamada', reunionFechaPropuesta: '2026-07-01' }),
    // cuenta limpia de outbound para comprobar que no se le pega el ruido de emp-mix
    toque({ idEmpresa: 'emp-out', origenLead: 'outbound', canal: 'llamada' }),
  ];
  const r = conversionPorOrigen(toques);

  assert.equal(r.cuentasInconsistentes.length, 1);
  assert.equal(r.cuentasInconsistentes[0].idEmpresa, 'emp-mix');
  assert.deepEqual([...r.cuentasInconsistentes[0].origenesVistos].sort(), ['inbound', 'outbound']);

  // emp-mix no aparece ni en outbound ni en inbound
  const outbound = r.porOrigen.find((g) => g.origen === 'outbound')!;
  assert.equal(outbound.llamadas, 1, 'solo la llamada de emp-out, la de emp-mix queda fuera');
  const inbound = r.porOrigen.find((g) => g.origen === 'inbound');
  assert.equal(inbound, undefined, 'inbound no debe existir: su unico toque era de la cuenta inconsistente');

  // el agregado es exactamente la suma de los grupos reportados (no incluye lo excluido)
  const sumaLlamadas = r.porOrigen.reduce((acc, g) => acc + g.llamadas, 0);
  const sumaReuniones = r.porOrigen.reduce((acc, g) => acc + g.reunionesConseguidas, 0);
  assert.equal(r.agregado.llamadas, sumaLlamadas);
  assert.equal(r.agregado.reunionesConseguidas, sumaReuniones);
  assert.equal(r.agregado.llamadas, 1);
  assert.equal(r.agregado.reunionesConseguidas, 0);
});

// ── cobertura: cuentas con origen registrado (incluidas las inconsistentes) vs sin registro ─

test('conversionPorOrigen: cobertura cuenta cuentas distintas, no toques, y una cuenta inconsistente cuenta como con-registro', () => {
  const toques: ToqueConOrigen[] = [
    toque({ idEmpresa: 'emp-out', origenLead: 'outbound', canal: 'llamada' }),
    toque({ idEmpresa: 'emp-out', origenLead: 'outbound', canal: 'llamada' }), // mismo origen, misma cuenta: no duplica cobertura
    toque({ idEmpresa: 'emp-sin', origenLead: null, canal: 'llamada' }),
    toque({ idEmpresa: 'emp-mix', origenLead: 'outbound', canal: 'llamada' }),
    toque({ idEmpresa: 'emp-mix', origenLead: 'evento', canal: 'llamada' }),
  ];
  const r = conversionPorOrigen(toques);
  // 3 cuentas distintas: emp-out (con origen), emp-sin (sin origen), emp-mix (con origen, aunque contradictorio)
  assert.deepEqual(r.cobertura, { cuentasConOrigen: 2, cuentasSinOrigen: 1, totalCuentas: 3, fraccion: 2 / 3 });
});

// ── agregado suma todos los grupos reportados en el caso normal (sin inconsistencias) ───────

test('conversionPorOrigen: el agregado suma exactamente los grupos por origen cuando no hay inconsistencias', () => {
  const toques: ToqueConOrigen[] = [
    toque({ idEmpresa: 'emp-1', origenLead: 'outbound', canal: 'llamada', reunionFechaPropuesta: '2026-07-01' }),
    toque({ idEmpresa: 'emp-2', origenLead: 'inbound', canal: 'llamada' }),
    toque({ idEmpresa: 'emp-3', origenLead: null, canal: 'llamada' }),
  ];
  const r = conversionPorOrigen(toques);
  assert.equal(r.agregado.llamadas, 3);
  assert.equal(r.agregado.reunionesConseguidas, 1);
  assert.equal(r.agregado.llamadasPorReunion, 3);
});
