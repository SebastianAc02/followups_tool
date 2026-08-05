// Propuesta de tandas (integraciones/propuesta-tandas.md en el brain), punto 4 del orden
// propuesto: "Contador de toques sin respuesta y umbral por segmento". Fija los OUTCOMES
// no negociables de la propuesta (dictados por el operador el 2026-08-04):
//  (1) toquesSinRespuestaConsecutivos: cuenta desde el mas reciente hacia atras, se
//      reinicia con CUALQUIER respuesta (resultado en RESULTADOS_CONTESTO o un WhatsApp
//      entrante), y un entrante nunca suma al contador, solo reinicia.
//  (2) UMBRALES_AGOTAMIENTO: el punto de partida dictado, configurable por parametro.
//  (3) estaAgotada/clasificarAgotamiento: la comparacion y su evidencia auditable.
//  (4) yaRespondioAlgunaVez: si el segmento seguimiento_con_respuesta_previa aplica.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toquesSinRespuestaConsecutivos,
  UMBRALES_AGOTAMIENTO,
  estaAgotada,
  clasificarAgotamiento,
  yaRespondioAlgunaVez,
  type ToqueParaAgotamiento,
} from './agotamiento.ts';

// ── helpers de fixture ──────────────────────────────────────────────────────────
// Toque nuestro sin respuesta (resultado fuera de RESULTADOS_CONTESTO, fuente distinta de
// whatsapp_entrante). no_contesto es el caso real mas comun (52 de 96 en la medicion del
// 2026-08-04 citada en la propuesta).
function sinResp(fechaDia: string): ToqueParaAgotamiento {
  return { resultado: 'no_contesto', fuente: 'cockpit', fechaDia, fecha: null };
}

// Toque nuestro que SI conto como respuesta (resultado en RESULTADOS_CONTESTO).
function conResp(fechaDia: string, resultado: ToqueParaAgotamiento['resultado'] = 'contesto_sigue_seguimiento'): ToqueParaAgotamiento {
  return { resultado, fuente: 'cockpit', fechaDia, fecha: null };
}

// Mensaje entrante de WhatsApp (fuente='whatsapp_entrante', ver registrarToqueEntrante en
// llego-respuesta.ts): no es un toque nuestro, resultado casi siempre null.
function entrante(fechaDia: string): ToqueParaAgotamiento {
  return { resultado: null, fuente: 'whatsapp_entrante', fechaDia, fecha: null };
}

// ── (1) toquesSinRespuestaConsecutivos ──────────────────────────────────────────

test('cero toques: cero sin respuesta', () => {
  assert.equal(toquesSinRespuestaConsecutivos([]), 0);
});

test('un solo toque sin respuesta: cuenta uno', () => {
  assert.equal(toquesSinRespuestaConsecutivos([sinResp('2026-08-01')]), 1);
});

test('un solo toque con respuesta: cuenta cero', () => {
  assert.equal(toquesSinRespuestaConsecutivos([conResp('2026-08-01')]), 0);
});

test('todos los toques con respuesta: cuenta cero', () => {
  const toques = [conResp('2026-07-01'), conResp('2026-07-15'), conResp('2026-08-01')];
  assert.equal(toquesSinRespuestaConsecutivos(toques), 0);
});

test('una respuesta vieja seguida de cinco sin respuesta: cuenta cinco', () => {
  const toques = [
    conResp('2026-07-01'),
    sinResp('2026-07-05'),
    sinResp('2026-07-10'),
    sinResp('2026-07-15'),
    sinResp('2026-07-20'),
    sinResp('2026-07-25'),
  ];
  assert.equal(toquesSinRespuestaConsecutivos(toques), 5);
});

test('un entrante en medio de una racha corta el conteo ahi, no suma', () => {
  // De mas viejo a mas nuevo: sinResp, sinResp, ENTRANTE, sinResp, sinResp.
  // Desde el mas reciente hacia atras: dos sin respuesta y despues el entrante reinicia.
  const toques = [sinResp('2026-07-01'), sinResp('2026-07-05'), entrante('2026-07-10'), sinResp('2026-07-15'), sinResp('2026-07-20')];
  assert.equal(toquesSinRespuestaConsecutivos(toques), 2);
});

test('un entrante como ultimo evento: cuenta cero, porque el ultimo evento fue respuesta', () => {
  const toques = [sinResp('2026-07-01'), sinResp('2026-07-05'), entrante('2026-07-10')];
  assert.equal(toquesSinRespuestaConsecutivos(toques), 3 - 3); // 0, dejado explicito el porque
});

test('el arreglo no viene ordenado: se ordena por fecha antes de contar', () => {
  const toques = [sinResp('2026-07-20'), conResp('2026-07-01'), sinResp('2026-07-10'), sinResp('2026-07-15')];
  assert.equal(toquesSinRespuestaConsecutivos(toques), 3);
});

test('usa fecha como respaldo cuando fechaDia no existe', () => {
  const toques: ToqueParaAgotamiento[] = [
    { resultado: 'contesto_no', fuente: 'cockpit', fechaDia: null, fecha: '2026-07-01T10:00:00.000Z' },
    { resultado: 'no_contesto', fuente: 'cockpit', fechaDia: null, fecha: '2026-07-10T10:00:00.000Z' },
    { resultado: 'no_contesto', fuente: 'cockpit', fechaDia: null, fecha: '2026-07-15T10:00:00.000Z' },
  ];
  assert.equal(toquesSinRespuestaConsecutivos(toques), 2);
});

test('un WhatsApp entrante sin resultado igual cuenta como respuesta', () => {
  // Explicito en la propuesta: "se reinicia con cualquier respuesta del prospecto,
  // incluido un WhatsApp entrante" -- aunque su resultado sea null.
  const toques = [entrante('2026-08-01')];
  assert.equal(toquesSinRespuestaConsecutivos(toques), 0);
});

// ── (2) UMBRALES_AGOTAMIENTO ────────────────────────────────────────────────────

test('umbrales de partida dictados por el operador el 2026-08-04', () => {
  assert.deepEqual(UMBRALES_AGOTAMIENTO, {
    frio: 3,
    reactivacion: 3,
    seguimiento_con_respuesta_previa: 4,
    reunion: 3,
    cierre: 5,
  });
});

// ── (3) estaAgotada / clasificarAgotamiento ─────────────────────────────────────

test('estaAgotada: bajo el umbral no esta agotada', () => {
  assert.equal(estaAgotada('frio', 2), false);
});

test('estaAgotada: al llegar al umbral (paso el umbral) esta agotada', () => {
  assert.equal(estaAgotada('frio', 3), true);
});

test('estaAgotada: por encima del umbral tambien esta agotada', () => {
  assert.equal(estaAgotada('cierre', 9), true);
});

test('estaAgotada: umbrales custom via parametro, no hardcodeados', () => {
  const umbralesCustom = { ...UMBRALES_AGOTAMIENTO, frio: 1 };
  assert.equal(estaAgotada('frio', 1, umbralesCustom), true);
  assert.equal(estaAgotada('frio', 1), false); // con el default (3) no alcanza
});

test('clasificarAgotamiento: trae segmento, sinRespuesta, umbral, agotada y evidencia auditable', () => {
  const c = clasificarAgotamiento('reunion', 3);
  assert.equal(c.segmento, 'reunion');
  assert.equal(c.sinRespuesta, 3);
  assert.equal(c.umbral, 3);
  assert.equal(c.agotada, true);
  assert.match(c.evidencia, /3/); // el conteo aparece en la evidencia
  assert.match(c.evidencia, /reunion/); // el umbral/segmento comparado aparece en la evidencia
});

test('clasificarAgotamiento: no agotada trae la misma evidencia auditable', () => {
  const c = clasificarAgotamiento('seguimiento_con_respuesta_previa', 2);
  assert.equal(c.agotada, false);
  assert.equal(c.umbral, 4);
  assert.match(c.evidencia, /2/);
  assert.match(c.evidencia, /4/);
});

test('clasificarAgotamiento: respeta umbrales custom pasados por parametro', () => {
  const umbralesCustom = { ...UMBRALES_AGOTAMIENTO, cierre: 1 };
  const c = clasificarAgotamiento('cierre', 1, umbralesCustom);
  assert.equal(c.umbral, 1);
  assert.equal(c.agotada, true);
});

// ── (4) yaRespondioAlgunaVez ─────────────────────────────────────────────────────

test('yaRespondioAlgunaVez: sin ninguna respuesta en el historial, false', () => {
  const toques = [sinResp('2026-07-01'), sinResp('2026-07-10')];
  assert.equal(yaRespondioAlgunaVez(toques), false);
});

test('yaRespondioAlgunaVez: con una respuesta antigua (resultado contesto), true', () => {
  const toques = [conResp('2026-07-01'), sinResp('2026-07-10'), sinResp('2026-07-20')];
  assert.equal(yaRespondioAlgunaVez(toques), true);
});

test('yaRespondioAlgunaVez: con un entrante en el historial, true aunque no tenga resultado', () => {
  const toques = [entrante('2026-07-01'), sinResp('2026-07-10')];
  assert.equal(yaRespondioAlgunaVez(toques), true);
});

test('yaRespondioAlgunaVez: historial vacio, false', () => {
  assert.equal(yaRespondioAlgunaVez([]), false);
});
