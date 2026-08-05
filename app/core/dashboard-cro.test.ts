// Paso 7 de la propuesta al CRO (integraciones/propuesta-write-path.md en el brain): el
// tablero que hoy no existe porque toda la actividad se mira por "toques totales", que
// esconde la unica pregunta que le importa al CRO -- cuantas reuniones produjo el trabajo,
// no cuantas veces se toco algo. Fija los OUTCOMES no negociables de los 7 bloques, con los
// numeros REALES medidos el 2026-08-04 sobre el periodo desde el corte del 20-jul como caso
// de prueba (mismo criterio que agotamiento.test.ts: anclar la funcion a datos que existieron
// de verdad, no a un fixture inventado).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  llamadasPorReunionConseguida,
  mixPorCanal,
  embudoReuniones,
  mixPorTipoToque,
  cierresSinMovimiento,
  tasaRespuestaPorEtapa,
  respuestasEntrantesWhatsapp,
  type ToqueDashboardCRO,
} from './dashboard-cro.ts';
import { TIPOS_TOQUE } from '../db/validation.ts';

// ── helper de fixture ───────────────────────────────────────────────────────────
function construirToque(overrides: Partial<ToqueDashboardCRO> = {}): ToqueDashboardCRO {
  return {
    idEmpresa: 'emp-generico',
    canal: 'llamada',
    tipoToque: null,
    resultado: null,
    fuente: 'cockpit',
    fechaDia: '2026-07-25',
    fecha: null,
    estado: 'contacto_iniciado',
    reunionFechaPropuesta: null,
    reunionFechaOcurrida: null,
    ...overrides,
  };
}

// ── fixture compartido: reconstruye el dia medido el 2026-08-04 ────────────────────────
// Once toques con reunionFechaPropuesta (el "11 reuniones propuestas" del doc): cuatro
// ocurridas (dos via reunionFechaOcurrida, dos via resultado en RESULTADOS_REUNION_OCURRIDA,
// mismo doble camino que conteosActividad en mcp/tools.ts), tres no-show (resultado
// 'no_llego') y CUATRO sin desenlace todavia -- el doc citaba 7 sin desenlace pero
// 11 - 4 - 3 = 4, no 7; la resta mal hecha en el doc no se reproduce aca.
const conReunionPropuesta: ToqueDashboardCRO[] = [
  construirToque({ canal: 'reunion', idEmpresa: 'emp-1', reunionFechaPropuesta: '2026-07-10', reunionFechaOcurrida: '2026-07-10', resultado: 'reunion_buena' }),
  construirToque({ canal: 'reunion', idEmpresa: 'emp-2', reunionFechaPropuesta: '2026-07-11', reunionFechaOcurrida: '2026-07-11' }),
  construirToque({ canal: 'reunion', idEmpresa: 'emp-3', reunionFechaPropuesta: '2026-07-12', resultado: 'reunion_fria' }),
  construirToque({ canal: 'reunion', idEmpresa: 'emp-4', reunionFechaPropuesta: '2026-07-13', resultado: 'se_presento' }),
  construirToque({ canal: 'llamada', idEmpresa: 'emp-5', reunionFechaPropuesta: '2026-07-14', resultado: 'no_llego' }),
  construirToque({ canal: 'llamada', idEmpresa: 'emp-6', reunionFechaPropuesta: '2026-07-15', resultado: 'no_llego' }),
  construirToque({ canal: 'whatsapp', idEmpresa: 'emp-7', reunionFechaPropuesta: '2026-07-16', resultado: 'no_llego' }),
  construirToque({ canal: 'llamada', idEmpresa: 'emp-8', reunionFechaPropuesta: '2026-07-17' }),
  construirToque({ canal: 'llamada', idEmpresa: 'emp-9', reunionFechaPropuesta: '2026-07-18' }),
  construirToque({ canal: 'whatsapp', idEmpresa: 'emp-10', reunionFechaPropuesta: '2026-07-19' }),
  construirToque({ canal: 'llamada', idEmpresa: 'emp-11', reunionFechaPropuesta: '2026-07-20' }),
];
// canal entre estos 11: reunion=4, llamada=5, whatsapp=2.

// El resto del periodo (85 toques) sin reunion propuesta, completando los totales por canal
// del doc (69 llamada, 18 whatsapp, 8 reunion, 1 correo) y el mix de tipo (30 con tipoToque
// sobre 96, el resto mudo -- CRITICO segun el punto 4: nunca se reparte entre los que si
// tienen tipo).
const canalesRestantes: string[] = [
  ...Array(64).fill('llamada'), // 5 + 64 = 69
  ...Array(16).fill('whatsapp'), // 2 + 16 = 18
  ...Array(4).fill('reunion'), // 4 + 4 = 8
  ...Array(1).fill('correo'), // 0 + 1 = 1
];
const restoDelPeriodo: ToqueDashboardCRO[] = canalesRestantes.map((canal, i) =>
  construirToque({
    canal,
    idEmpresa: `emp-r${i}`,
    // Los primeros 30 de estos 85 llevan tipoToque, cíclico sobre los cinco tipos reales.
    tipoToque: i < 30 ? TIPOS_TOQUE[i % TIPOS_TOQUE.length] : null,
  }),
);

const periodoCompleto: ToqueDashboardCRO[] = [...conReunionPropuesta, ...restoDelPeriodo];

test('fixture compartido tiene 96 toques, igual al periodo medido el 2026-08-04', () => {
  assert.equal(periodoCompleto.length, 96);
});

// ── (1) llamadasPorReunionConseguida ────────────────────────────────────────────────────

test('llamadasPorReunionConseguida: 69 llamadas / 11 reuniones propuestas', () => {
  const r = llamadasPorReunionConseguida(periodoCompleto);
  assert.equal(r.llamadas, 69);
  assert.equal(r.reunionesPropuestas, 11);
  assert.equal(r.llamadasPorReunion, 69 / 11); // ~6.27, el doc lo redondea a 6,3
});

test('llamadasPorReunionConseguida: cero reuniones propuestas no es Infinity ni NaN, es null', () => {
  const soloLlamadas = [construirToque({ canal: 'llamada' }), construirToque({ canal: 'llamada' })];
  const r = llamadasPorReunionConseguida(soloLlamadas);
  assert.equal(r.llamadas, 2);
  assert.equal(r.reunionesPropuestas, 0);
  assert.equal(r.llamadasPorReunion, null);
});

test('llamadasPorReunionConseguida: cero toques, todo en cero y sin division invalida', () => {
  const r = llamadasPorReunionConseguida([]);
  assert.deepEqual(r, { llamadas: 0, reunionesPropuestas: 0, llamadasPorReunion: null });
});

// ── (2) mixPorCanal ──────────────────────────────────────────────────────────────────────

test('mixPorCanal: 69 llamada, 18 whatsapp, 8 reunion, 1 correo, total 96', () => {
  const r = mixPorCanal(periodoCompleto);
  assert.deepEqual(r.porCanal, { llamada: 69, whatsapp: 18, reunion: 8, correo: 1 });
  assert.equal(r.total, 96);
});

test('mixPorCanal: cero toques trae mapa vacio y total cero', () => {
  const r = mixPorCanal([]);
  assert.deepEqual(r.porCanal, {});
  assert.equal(r.total, 0);
});

test('mixPorCanal: canal null cae en su propia llave, no se descarta', () => {
  const r = mixPorCanal([construirToque({ canal: null })]);
  assert.deepEqual(r.porCanal, { sin_canal: 1 });
});

// ── (3) embudoReuniones ──────────────────────────────────────────────────────────────────

test('embudoReuniones: 11 propuestas, 4 ocurridas, 3 no-show, 4 sin desenlace (no 7)', () => {
  const r = embudoReuniones(periodoCompleto);
  assert.equal(r.propuestas, 11);
  assert.equal(r.ocurridas, 4);
  assert.equal(r.noShow, 3);
  // El doc citaba 7: 4 + 3 = 7 y las propuestas son 11, asi que sin desenlace es 11-4-3=4.
  assert.equal(r.sinDesenlace, 4);
});

test('embudoReuniones: cero toques, todo en cero', () => {
  const r = embudoReuniones([]);
  assert.deepEqual(r, { propuestas: 0, ocurridas: 0, noShow: 0, sinDesenlace: 0 });
});

test('embudoReuniones: una reunion ocurrida solo por reunionFechaOcurrida (sin resultado) cuenta', () => {
  const r = embudoReuniones([construirToque({ reunionFechaPropuesta: '2026-07-01', reunionFechaOcurrida: '2026-07-01', resultado: null })]);
  assert.equal(r.ocurridas, 1);
});

test('embudoReuniones: una reunion ocurrida solo por resultado (sin reunionFechaOcurrida) cuenta', () => {
  const r = embudoReuniones([construirToque({ reunionFechaPropuesta: '2026-07-01', resultado: 'se_presento' })]);
  assert.equal(r.ocurridas, 1);
});

// ── (4) mixPorTipoToque ──────────────────────────────────────────────────────────────────

test('mixPorTipoToque: 30 con tipo sobre 96, nunca repartidos entre los que si lo tienen', () => {
  const r = mixPorTipoToque(periodoCompleto);
  assert.equal(r.toquesConTipo, 30);
  assert.equal(r.toquesSinTipo, 66);
  const sumaPorTipo = Object.values(r.porTipo).reduce((s, n) => s + n, 0);
  assert.equal(sumaPorTipo, 30); // el mix nunca suma mas que los que SI traen tipo
});

test('mixPorTipoToque: todos los toques sin tipo, mix vacio y sinTipo = total', () => {
  const toques = [construirToque({ tipoToque: null }), construirToque({ tipoToque: null })];
  const r = mixPorTipoToque(toques);
  assert.deepEqual(r.porTipo, {});
  assert.equal(r.toquesConTipo, 0);
  assert.equal(r.toquesSinTipo, 2);
});

test('mixPorTipoToque: cero toques, todo en cero', () => {
  const r = mixPorTipoToque([]);
  assert.deepEqual(r, { porTipo: {}, toquesConTipo: 0, toquesSinTipo: 0 });
});

// ── (5) cierresSinMovimiento ─────────────────────────────────────────────────────────────

const HOY = '2026-08-04';

test('cierresSinMovimiento: ultimo toque a 10 dias, con umbral 7, cae en riesgo', () => {
  const toques = [
    construirToque({ idEmpresa: 'emp-cierre-1', estado: 'cierre_documentacion', fechaDia: '2026-07-25' }), // 10 dias
  ];
  const r = cierresSinMovimiento(toques, HOY);
  assert.equal(r.umbralDias, 7);
  assert.equal(r.cuentasEvaluadas, 1);
  assert.equal(r.enRiesgo.length, 1);
  assert.equal(r.enRiesgo[0].idEmpresa, 'emp-cierre-1');
  assert.equal(r.enRiesgo[0].diasSinMovimiento, 10);
});

test('cierresSinMovimiento: ultimo toque a 3 dias no cae en riesgo con umbral default', () => {
  const toques = [construirToque({ idEmpresa: 'emp-cierre-2', estado: 'enviar_contrato', fechaDia: '2026-08-01' })]; // 3 dias
  const r = cierresSinMovimiento(toques, HOY);
  assert.equal(r.cuentasEvaluadas, 1);
  assert.equal(r.enRiesgo.length, 0);
});

test('cierresSinMovimiento: exactamente en el umbral (7 dias) SI cae -- es >=, no >', () => {
  const toques = [construirToque({ idEmpresa: 'emp-cierre-3', estado: 'cierre_documentacion', fechaDia: '2026-07-28' })]; // 7 dias
  const r = cierresSinMovimiento(toques, HOY);
  assert.equal(r.enRiesgo.length, 1);
  assert.equal(r.enRiesgo[0].diasSinMovimiento, 7);
});

test('cierresSinMovimiento: cuenta fuera de etapa de cierre no entra a evaluadas ni a riesgo', () => {
  const toques = [construirToque({ idEmpresa: 'emp-oportunidad', estado: 'oportunidad', fechaDia: '2026-06-01' })]; // muy viejo, pero no es cierre
  const r = cierresSinMovimiento(toques, HOY);
  assert.equal(r.cuentasEvaluadas, 0);
  assert.equal(r.enRiesgo.length, 0);
});

test('cierresSinMovimiento: cuenta en cierre sin ningun toque fechado se reporta aparte, no se inventa un dia', () => {
  const toques = [construirToque({ idEmpresa: 'emp-sin-fecha', estado: 'enviar_contrato', fechaDia: null, fecha: null })];
  const r = cierresSinMovimiento(toques, HOY);
  assert.equal(r.cuentasEvaluadas, 0);
  assert.equal(r.cuentasSinFechaUtil, 1);
  assert.equal(r.enRiesgo.length, 0);
});

test('cierresSinMovimiento: usa el toque MAS RECIENTE de la cuenta, no el mas viejo', () => {
  const toques = [
    construirToque({ idEmpresa: 'emp-multi', estado: 'cierre_documentacion', fechaDia: '2026-06-01' }),
    construirToque({ idEmpresa: 'emp-multi', estado: 'cierre_documentacion', fechaDia: '2026-08-02' }), // 2 dias, el mas reciente
  ];
  const r = cierresSinMovimiento(toques, HOY);
  assert.equal(r.enRiesgo.length, 0); // el mas reciente (2 dias) queda bajo el umbral
});

test('cierresSinMovimiento: umbralDias configurable', () => {
  const toques = [construirToque({ idEmpresa: 'emp-cierre-4', estado: 'cierre_documentacion', fechaDia: '2026-08-01' })]; // 3 dias
  const r = cierresSinMovimiento(toques, HOY, 2);
  assert.equal(r.umbralDias, 2);
  assert.equal(r.enRiesgo.length, 1);
});

test('cierresSinMovimiento: etapasCierre configurable', () => {
  const toques = [construirToque({ idEmpresa: 'emp-custom', estado: 'oportunidad', fechaDia: '2026-06-01' })];
  const r = cierresSinMovimiento(toques, HOY, 7, ['oportunidad']);
  assert.equal(r.cuentasEvaluadas, 1);
  assert.equal(r.enRiesgo.length, 1);
});

test('cierresSinMovimiento: cero toques, todo en cero', () => {
  const r = cierresSinMovimiento([], HOY);
  assert.deepEqual(r, { umbralDias: 7, cuentasEvaluadas: 0, cuentasSinFechaUtil: 0, enRiesgo: [] });
});

// ── (6) tasaRespuestaPorEtapa ────────────────────────────────────────────────────────────
// El doc pide explicito que el agregado esconde varianza por etapa (24% agregado vs 44%
// arriba de la reunion y 15% antes). No hay data cruda por toque para esas cifras exactas
// en la propuesta (son un corte por bandas del embudo, no por etapa individual); este
// fixture es sintetico pero prueba el mismo punto estructural con N auditable en cada etapa.

test('tasaRespuestaPorEtapa: agregado esconde la varianza que trae el corte por etapa', () => {
  const toques = [
    // etapa 'lead': 1 de 4 contesta (25%)
    construirToque({ estado: 'lead', resultado: 'no_contesto' }),
    construirToque({ estado: 'lead', resultado: 'no_contesto' }),
    construirToque({ estado: 'lead', resultado: 'no_contesto' }),
    construirToque({ estado: 'lead', resultado: 'contesto_sigue_seguimiento' }),
    // etapa 'oportunidad': 3 de 4 contestan (75%)
    construirToque({ estado: 'oportunidad', resultado: 'contesto_sigue_seguimiento' }),
    construirToque({ estado: 'oportunidad', resultado: 'contesto_reunion' }),
    construirToque({ estado: 'oportunidad', resultado: 'push_cierre' }),
    construirToque({ estado: 'oportunidad', resultado: 'no_contesto' }),
  ];
  const r = tasaRespuestaPorEtapa(toques);
  const lead = r.porEtapa.find((e) => e.etapa === 'lead')!;
  const oportunidad = r.porEtapa.find((e) => e.etapa === 'oportunidad')!;
  assert.equal(lead.total, 4);
  assert.equal(lead.contestados, 1);
  assert.equal(lead.tasa, 0.25);
  assert.equal(oportunidad.total, 4);
  assert.equal(oportunidad.contestados, 3);
  assert.equal(oportunidad.tasa, 0.75);
  assert.equal(r.agregado.total, 8);
  assert.equal(r.agregado.contestados, 4);
  assert.equal(r.agregado.tasa, 0.5); // el agregado (50%) no es ni 25% ni 75%: esconde las dos
});

test('tasaRespuestaPorEtapa: los entrantes de WhatsApp no entran al denominador de ninguna etapa', () => {
  const toques = [
    construirToque({ estado: 'lead', resultado: 'no_contesto', fuente: 'cockpit' }),
    construirToque({ estado: 'lead', resultado: null, fuente: 'whatsapp_entrante' }), // no es trabajo del operador
  ];
  const r = tasaRespuestaPorEtapa(toques);
  const lead = r.porEtapa.find((e) => e.etapa === 'lead')!;
  assert.equal(lead.total, 1); // no 2
  assert.equal(r.agregado.total, 1);
});

test('tasaRespuestaPorEtapa: estado null cae en su propia llave sin_etapa', () => {
  const toques = [construirToque({ estado: null, resultado: 'contesto_reunion' })];
  const r = tasaRespuestaPorEtapa(toques);
  assert.equal(r.porEtapa.length, 1);
  assert.equal(r.porEtapa[0].etapa, '__sin_etapa__');
});

test('tasaRespuestaPorEtapa: cero toques, agregado con tasa null, no NaN', () => {
  const r = tasaRespuestaPorEtapa([]);
  assert.deepEqual(r.porEtapa, []);
  assert.equal(r.agregado.total, 0);
  assert.equal(r.agregado.contestados, 0);
  assert.equal(r.agregado.tasa, null);
});

test('tasaRespuestaPorEtapa: todos los toques son entrantes de WhatsApp, agregado en cero sin NaN', () => {
  const toques = [construirToque({ estado: 'lead', fuente: 'whatsapp_entrante', resultado: null })];
  const r = tasaRespuestaPorEtapa(toques);
  assert.deepEqual(r.porEtapa, []);
  assert.equal(r.agregado.tasa, null);
});

// ── (7) respuestasEntrantesWhatsapp ──────────────────────────────────────────────────────

test('respuestasEntrantesWhatsapp: 143 mensajes en 15 cuentas', () => {
  // 15 cuentas, 143 mensajes: 8 cuentas con 10 mensajes y 7 cuentas con 9 (8*10+7*9=143).
  const entrantes: ToqueDashboardCRO[] = [];
  for (let c = 0; c < 15; c++) {
    const mensajes = c < 8 ? 10 : 9;
    for (let m = 0; m < mensajes; m++) {
      entrantes.push(construirToque({ idEmpresa: `emp-wa-${c}`, fuente: 'whatsapp_entrante', resultado: null }));
    }
  }
  // toques nuestros de paso, que no deben contarse aca (esto es actividad, no respuesta entrante)
  const ejecutadosDePaso = [construirToque({ idEmpresa: 'emp-wa-0', fuente: 'cockpit' })];
  const r = respuestasEntrantesWhatsapp([...entrantes, ...ejecutadosDePaso]);
  assert.equal(r.totalMensajes, 143);
  assert.equal(r.cuentasUnicas, 15);
});

test('respuestasEntrantesWhatsapp: sin entrantes, cero y cero', () => {
  const r = respuestasEntrantesWhatsapp([construirToque({ fuente: 'cockpit' })]);
  assert.deepEqual(r, { totalMensajes: 0, cuentasUnicas: 0 });
});

test('respuestasEntrantesWhatsapp: cero toques, cero y cero', () => {
  const r = respuestasEntrantesWhatsapp([]);
  assert.deepEqual(r, { totalMensajes: 0, cuentasUnicas: 0 });
});

test('respuestasEntrantesWhatsapp: varios mensajes de la misma cuenta cuentan una sola vez en cuentasUnicas', () => {
  const toques = [
    construirToque({ idEmpresa: 'emp-1', fuente: 'whatsapp_entrante' }),
    construirToque({ idEmpresa: 'emp-1', fuente: 'whatsapp_entrante' }),
    construirToque({ idEmpresa: 'emp-1', fuente: 'whatsapp_entrante' }),
  ];
  const r = respuestasEntrantesWhatsapp(toques);
  assert.equal(r.totalMensajes, 3);
  assert.equal(r.cuentasUnicas, 1);
});
