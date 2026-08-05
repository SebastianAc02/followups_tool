// Cuatro metricas de actividad por canal, pedidas sueltas del panel (2026-08-05). Fija los
// OUTCOMES no negociables del pedido:
//  (1) grupoDeCanal/toquesPorGrupo: el operador piensa en texto vs llamada, no en los cuatro
//      canales de CANALES_TOQUE; reunion queda aparte porque es un desenlace, no un canal.
//  (2) connectRate: de las llamadas hechas, cuantas conectaron. Una llamada sin resultado NO
//      es una llamada no conectada -- va aparte y sale del denominador.
//  (3) textoDeduplicado en dos modos (dia/conversacion), porque el operador describio la
//      regla de dos formas que dan numeros distintos. Los entrantes nunca cuentan pero en
//      modo conversacion mantienen viva la racha.
//  (4) llamadasPorNovedadDeCuenta: cuantas llamadas fueron a una cuenta que no tenia toque
//      previo.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  grupoDeCanal,
  toquesPorGrupo,
  connectRate,
  textoDeduplicado,
  llamadasPorNovedadDeCuenta,
  type ToqueCanal,
} from './actividad-canal.ts';

// ── helper de fixture ───────────────────────────────────────────────────────────
function toque(overrides: Partial<ToqueCanal> = {}): ToqueCanal {
  return {
    idEmpresa: 'emp-1',
    canal: 'whatsapp',
    resultado: null,
    fuente: 'cockpit',
    fechaDia: '2026-08-01',
    fecha: null,
    esPrimerToqueDeLaCuenta: false,
    ...overrides,
  };
}

// ── (1) grupoDeCanal / toquesPorGrupo ───────────────────────────────────────────

test('grupoDeCanal: whatsapp y correo caen en texto', () => {
  assert.equal(grupoDeCanal('whatsapp'), 'texto');
  assert.equal(grupoDeCanal('correo'), 'texto');
});

test('grupoDeCanal: llamada es su propio grupo', () => {
  assert.equal(grupoDeCanal('llamada'), 'llamada');
});

test('grupoDeCanal: reunion no es ni texto ni llamada', () => {
  assert.equal(grupoDeCanal('reunion'), 'reunion');
});

test('grupoDeCanal: null y un valor no reconocido caen en sin_canal', () => {
  assert.equal(grupoDeCanal(null), 'sin_canal');
  assert.equal(grupoDeCanal('fax'), 'sin_canal');
});

test('toquesPorGrupo: cero toques, todo en cero', () => {
  assert.deepEqual(toquesPorGrupo([]), { texto: 0, llamada: 0, reunion: 0, sinCanal: 0, total: 0 });
});

test('toquesPorGrupo: mezcla de canales cuenta cada grupo y el total', () => {
  const toques = [
    toque({ canal: 'whatsapp' }),
    toque({ canal: 'correo' }),
    toque({ canal: 'llamada' }),
    toque({ canal: 'llamada' }),
    toque({ canal: 'reunion' }),
    toque({ canal: null }),
  ];
  assert.deepEqual(toquesPorGrupo(toques), { texto: 2, llamada: 2, reunion: 1, sinCanal: 1, total: 6 });
});

// ── (2) connectRate ──────────────────────────────────────────────────────────────

test('connectRate: cero llamadas, tasa null', () => {
  assert.deepEqual(connectRate([]), { llamadas: 0, conectadas: 0, noConectadas: 0, sinResultado: 0, tasa: null });
});

test('connectRate: todas las llamadas sin resultado, tasa null (no cero, no NaN)', () => {
  const toques = [
    toque({ canal: 'llamada', resultado: null }),
    toque({ canal: 'llamada', resultado: null }),
    toque({ canal: 'llamada', resultado: null }),
  ];
  const r = connectRate(toques);
  assert.equal(r.llamadas, 3);
  assert.equal(r.sinResultado, 3);
  assert.equal(r.conectadas, 0);
  assert.equal(r.noConectadas, 0);
  assert.equal(r.tasa, null);
});

test('connectRate: sin resultado sale del denominador, no cuenta como no conectada', () => {
  const toques = [
    toque({ canal: 'llamada', resultado: 'contesto_reunion' }), // conectada
    toque({ canal: 'llamada', resultado: 'no_contesto' }), // no conectada (resultado != RESULTADOS_CONTESTO)
    toque({ canal: 'llamada', resultado: null }), // sin resultado
  ];
  const r = connectRate(toques);
  assert.equal(r.llamadas, 3);
  assert.equal(r.conectadas, 1);
  assert.equal(r.noConectadas, 1);
  assert.equal(r.sinResultado, 1);
  // denominador es 2 (conectadas + noConectadas), no 3: el sinResultado no infla la tasa a la baja.
  assert.equal(r.tasa, 0.5);
});

test('connectRate: toques de otro canal no cuentan como llamada', () => {
  const toques = [
    toque({ canal: 'whatsapp', resultado: 'contesto_reunion' }),
    toque({ canal: 'reunion', resultado: 'reunion_buena' }),
  ];
  assert.deepEqual(connectRate(toques), { llamadas: 0, conectadas: 0, noConectadas: 0, sinResultado: 0, tasa: null });
});

// ── (3) textoDeduplicado ──────────────────────────────────────────────────────────

test('textoDeduplicado: cero toques, todo en cero en los dos modos', () => {
  assert.deepEqual(textoDeduplicado([], { modo: 'dia' }), { modo: 'dia', crudos: 0, deduplicados: 0, colapsados: 0 });
  assert.deepEqual(textoDeduplicado([], { modo: 'conversacion' }), {
    modo: 'conversacion',
    crudos: 0,
    deduplicados: 0,
    colapsados: 0,
  });
});

test('textoDeduplicado modo dia: cinco whatsapps a la misma cuenta el mismo dia cuentan como uno', () => {
  const toques = Array.from({ length: 5 }, () => toque({ canal: 'whatsapp', fechaDia: '2026-08-01' }));
  assert.deepEqual(textoDeduplicado(toques, { modo: 'dia' }), {
    modo: 'dia',
    crudos: 5,
    deduplicados: 1,
    colapsados: 4,
  });
});

test('textoDeduplicado modo dia: dias distintos no colapsan', () => {
  const toques = [
    toque({ canal: 'whatsapp', fechaDia: '2026-08-01' }),
    toque({ canal: 'whatsapp', fechaDia: '2026-08-02' }),
  ];
  assert.deepEqual(textoDeduplicado(toques, { modo: 'dia' }), {
    modo: 'dia',
    crudos: 2,
    deduplicados: 2,
    colapsados: 0,
  });
});

test('textoDeduplicado modo dia: cuentas distintas el mismo dia no colapsan entre si', () => {
  const toques = [
    toque({ idEmpresa: 'emp-1', canal: 'whatsapp', fechaDia: '2026-08-01' }),
    toque({ idEmpresa: 'emp-2', canal: 'whatsapp', fechaDia: '2026-08-01' }),
  ];
  assert.deepEqual(textoDeduplicado(toques, { modo: 'dia' }), {
    modo: 'dia',
    crudos: 2,
    deduplicados: 2,
    colapsados: 0,
  });
});

test('textoDeduplicado: un entrante en medio no suma a crudos ni a deduplicados', () => {
  const toques = [
    toque({ canal: 'whatsapp', fuente: 'cockpit', fechaDia: '2026-08-01' }),
    toque({ canal: 'whatsapp', fuente: 'whatsapp_entrante', resultado: null, fechaDia: '2026-08-01' }),
  ];
  const r = textoDeduplicado(toques, { modo: 'dia' });
  assert.equal(r.crudos, 1);
  assert.equal(r.deduplicados, 1);
});

test('textoDeduplicado: solo entrantes, ningun toque nuestro -- todo en cero en los dos modos', () => {
  const toques = [
    toque({ canal: 'whatsapp', fuente: 'whatsapp_entrante', resultado: null, fechaDia: '2026-08-01' }),
    toque({ canal: 'whatsapp', fuente: 'whatsapp_entrante', resultado: null, fechaDia: '2026-08-05' }),
  ];
  assert.deepEqual(textoDeduplicado(toques, { modo: 'dia' }), { modo: 'dia', crudos: 0, deduplicados: 0, colapsados: 0 });
  assert.deepEqual(textoDeduplicado(toques, { modo: 'conversacion' }), {
    modo: 'conversacion',
    crudos: 0,
    deduplicados: 0,
    colapsados: 0,
  });
});

test('textoDeduplicado modo conversacion: dos conversaciones separadas por 10 dias de silencio cuentan como dos', () => {
  const toques = [
    toque({ canal: 'whatsapp', fechaDia: '2026-08-01' }),
    toque({ canal: 'whatsapp', fechaDia: '2026-08-11' }), // 10 dias de gap, default diasDeSilencio=7
  ];
  assert.deepEqual(textoDeduplicado(toques, { modo: 'conversacion' }), {
    modo: 'conversacion',
    crudos: 2,
    deduplicados: 2,
    colapsados: 0,
  });
});

test('textoDeduplicado modo conversacion: una racha de cinco toques en cinco dias seguidos (silencio maximo 1 dia) cuenta como una sola conversacion', () => {
  const toques = [
    toque({ canal: 'whatsapp', fechaDia: '2026-08-01' }),
    toque({ canal: 'whatsapp', fechaDia: '2026-08-02' }),
    toque({ canal: 'whatsapp', fechaDia: '2026-08-03' }),
    toque({ canal: 'whatsapp', fechaDia: '2026-08-04' }),
    toque({ canal: 'whatsapp', fechaDia: '2026-08-05' }),
  ];
  assert.deepEqual(textoDeduplicado(toques, { modo: 'conversacion' }), {
    modo: 'conversacion',
    crudos: 5,
    deduplicados: 1,
    colapsados: 4,
  });
});

test('textoDeduplicado modo conversacion: un entrante en medio de una racha la mantiene viva y no la corta, y no suma', () => {
  // out (dia 1) -> entrante (dia 4, dentro del silencio de 7) -> out (dia 6, dentro del
  // silencio contado desde el entrante). Sin el entrante manteniendo viva la racha, el gap
  // real entre los dos out (1 a 6 = 5 dias) igual estaria dentro del umbral, asi que este
  // fixture prueba ademas que el entrante no corta aunque el gap se mida desde el entrante.
  const toques = [
    toque({ canal: 'whatsapp', fuente: 'cockpit', fechaDia: '2026-08-01' }),
    toque({ canal: 'whatsapp', fuente: 'whatsapp_entrante', resultado: null, fechaDia: '2026-08-04' }),
    toque({ canal: 'whatsapp', fuente: 'cockpit', fechaDia: '2026-08-06' }),
  ];
  assert.deepEqual(textoDeduplicado(toques, { modo: 'conversacion' }), {
    modo: 'conversacion',
    crudos: 2,
    deduplicados: 1,
    colapsados: 1,
  });
});

test('textoDeduplicado modo conversacion: diasDeSilencio configurable corta mas seguido', () => {
  const toques = [
    toque({ canal: 'whatsapp', fechaDia: '2026-08-01' }),
    toque({ canal: 'whatsapp', fechaDia: '2026-08-04' }), // gap de 3 dias
  ];
  // con el default (7) el gap de 3 dias no corta: una sola conversacion.
  assert.deepEqual(textoDeduplicado(toques, { modo: 'conversacion' }), {
    modo: 'conversacion',
    crudos: 2,
    deduplicados: 1,
    colapsados: 1,
  });
  // con diasDeSilencio=2 el mismo gap de 3 dias ya corta: dos conversaciones, nada colapsa.
  assert.deepEqual(textoDeduplicado(toques, { modo: 'conversacion', diasDeSilencio: 2 }), {
    modo: 'conversacion',
    crudos: 2,
    deduplicados: 2,
    colapsados: 0,
  });
});

test('textoDeduplicado: los dos modos dan numeros distintos sobre el mismo fixture', () => {
  // Misma racha de 5 toques en 5 dias seguidos: modo dia no colapsa nada (cinco fechaDia
  // distintos), modo conversacion la colapsa entera en una sola conversacion.
  const toques = [
    toque({ canal: 'whatsapp', fechaDia: '2026-08-01' }),
    toque({ canal: 'whatsapp', fechaDia: '2026-08-02' }),
    toque({ canal: 'whatsapp', fechaDia: '2026-08-03' }),
    toque({ canal: 'whatsapp', fechaDia: '2026-08-04' }),
    toque({ canal: 'whatsapp', fechaDia: '2026-08-05' }),
  ];
  const porDia = textoDeduplicado(toques, { modo: 'dia' });
  const porConversacion = textoDeduplicado(toques, { modo: 'conversacion' });
  assert.equal(porDia.crudos, porConversacion.crudos);
  assert.equal(porDia.deduplicados, 5);
  assert.equal(porConversacion.deduplicados, 1);
  assert.notEqual(porDia.colapsados, porConversacion.colapsados);
});

// ── (4) llamadasPorNovedadDeCuenta ────────────────────────────────────────────────

test('llamadasPorNovedadDeCuenta: cero toques, todo en cero', () => {
  assert.deepEqual(llamadasPorNovedadDeCuenta([]), { llamadasTotal: 0, aCuentasNuevas: 0, aCuentasConHistoria: 0 });
});

test('llamadasPorNovedadDeCuenta: solo cuenta llamadas, no texto', () => {
  const toques = [
    toque({ canal: 'llamada', esPrimerToqueDeLaCuenta: true }),
    toque({ canal: 'whatsapp', esPrimerToqueDeLaCuenta: true }),
  ];
  assert.deepEqual(llamadasPorNovedadDeCuenta(toques), { llamadasTotal: 1, aCuentasNuevas: 1, aCuentasConHistoria: 0 });
});

test('llamadasPorNovedadDeCuenta: reparte entre nuevas y con historia', () => {
  const toques = [
    toque({ canal: 'llamada', esPrimerToqueDeLaCuenta: true }),
    toque({ canal: 'llamada', esPrimerToqueDeLaCuenta: false }),
    toque({ canal: 'llamada', esPrimerToqueDeLaCuenta: false }),
  ];
  assert.deepEqual(llamadasPorNovedadDeCuenta(toques), { llamadasTotal: 3, aCuentasNuevas: 1, aCuentasConHistoria: 2 });
});
