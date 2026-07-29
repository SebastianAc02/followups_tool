import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectarClicEscaner,
  senalIpDatacenterNoImplementada,
  type ClicParaDetectarEscaner,
} from './detectar-clic-escaner.ts';

// --- Casos reales medidos en produccion (campana 58, envio 2026-07-29T05:09:05Z) ---
// Los dos son clics humanos CONFIRMADOS por el operador. Si alguno sale 'probable_escaner',
// es el falso positivo que arruina todo el detector.

test('evento 14 (clic real iPhone, ~2h despues del envio) NO sale escaner', () => {
  const clic: ClicParaDetectarEscaner = {
    fechaEvento: '2026-07-29T07:16:56.808Z',
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    detalle: {
      ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5.2 Mobile/15E148 Safari/604.1',
      url: 'https://example.org/prueba-2-a',
    },
  };
  const v = detectarClicEscaner(clic);
  assert.equal(v.clasificacion, 'sin_evidencia_de_escaner');
  assert.deepEqual(v.senales, []);
});

test('evento 15 (clic real Mac, ~2h despues del envio) NO sale escaner', () => {
  const clic: ClicParaDetectarEscaner = {
    fechaEvento: '2026-07-29T07:17:11.372Z',
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    detalle: {
      ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
      url: 'https://example.org/prueba-2-b',
    },
  };
  const v = detectarClicEscaner(clic);
  assert.equal(v.clasificacion, 'sin_evidencia_de_escaner');
  assert.deepEqual(v.senales, []);
});

// --- Senal 1: latencia bajo el piso de escaner ---

test('clic instantaneo (2 segundos tras el envio) sale probable_escaner por latencia', () => {
  const clic: ClicParaDetectarEscaner = {
    fechaEvento: '2026-07-29T05:09:07.000Z',
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    detalle: {
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      url: 'https://example.org/prueba-normal',
    },
  };
  const v = detectarClicEscaner(clic);
  assert.equal(v.clasificacion, 'probable_escaner');
  assert.ok(v.senales.includes('latencia_bajo_piso_escaner'));
  assert.equal(v.confianza, 'media');
});

test('clic justo en el piso (30000ms exactos) NO dispara latencia, cae del lado seguro', () => {
  const clic: ClicParaDetectarEscaner = {
    fechaEvento: '2026-07-29T05:09:35.000Z',
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    detalle: { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' },
  };
  const v = detectarClicEscaner(clic);
  assert.ok(!v.senales.includes('latencia_bajo_piso_escaner'));
});

test('clic a 29999ms del envio SI dispara latencia (justo bajo el piso)', () => {
  const clic: ClicParaDetectarEscaner = {
    fechaEvento: '2026-07-29T05:09:34.999Z',
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    detalle: { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' },
  };
  const v = detectarClicEscaner(clic);
  assert.ok(v.senales.includes('latencia_bajo_piso_escaner'));
});

test('sin fecha_envio, la senal de latencia no dispara (no hay delta que calcular)', () => {
  const clic: ClicParaDetectarEscaner = {
    fechaEvento: '2026-07-29T05:09:07.000Z',
    detalle: { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' },
  };
  const v = detectarClicEscaner(clic);
  assert.ok(!v.senales.includes('latencia_bajo_piso_escaner'));
});

test('el caso del humano que de verdad clickea rapido (estaba mirando el correo) queda marcado como probable_escaner: limitacion conocida, no bug', () => {
  // Este es exactamente el false-positive-por-diseño documentado en la tarea: la senal de
  // latencia no distingue "escaner en la entrega" de "humano que abrio el correo apenas llego
  // y clickeo al toque". El umbral es provisional y generico -- por eso la confianza queda en
  // 'media', nunca 'alta', y por eso esta senal sola nunca se reporta como certeza en ningun
  // lado consumidor.
  const clic: ClicParaDetectarEscaner = {
    fechaEvento: '2026-07-29T05:09:20.000Z', // 15s tras el envio, humano real y rapido
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    detalle: {
      ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5.2 Mobile/15E148 Safari/604.1',
      url: 'https://example.org/prueba-rapida',
    },
  };
  const v = detectarClicEscaner(clic);
  assert.equal(v.clasificacion, 'probable_escaner');
  assert.equal(v.confianza, 'media');
});

// --- Senal 2: url reescrita por escaner conocido ---

test('url reescrita por Microsoft Safe Links sale probable_escaner', () => {
  const clic: ClicParaDetectarEscaner = {
    fechaEvento: '2026-07-29T08:00:00.000Z',
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    detalle: {
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      url: 'https://nam02.safelinks.protection.outlook.com/?url=https%3A%2F%2Fexample.org%2Fprueba&data=abc',
    },
  };
  const v = detectarClicEscaner(clic);
  assert.equal(v.clasificacion, 'probable_escaner');
  assert.ok(v.senales.includes('url_reescrita_por_escaner'));
  assert.equal(v.confianza, 'media');
});

test('url reescrita por Proofpoint URL Defense (formato legado) sale probable_escaner', () => {
  const clic: ClicParaDetectarEscaner = {
    fechaEvento: '2026-07-29T08:00:00.000Z',
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    detalle: {
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      url: 'https://urldefense.proofpoint.com/v2/url?u=https-3A__example.org_prueba&d=abc',
    },
  };
  const v = detectarClicEscaner(clic);
  assert.equal(v.clasificacion, 'probable_escaner');
  assert.ok(v.senales.includes('url_reescrita_por_escaner'));
});

test('url reescrita por Mimecast URL Protect sale probable_escaner', () => {
  const clic: ClicParaDetectarEscaner = {
    fechaEvento: '2026-07-29T08:00:00.000Z',
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    detalle: {
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      url: 'https://protect-us.mimecast.com/s/AbCd?domain=example.org',
    },
  };
  const v = detectarClicEscaner(clic);
  assert.equal(v.clasificacion, 'probable_escaner');
  assert.ok(v.senales.includes('url_reescrita_por_escaner'));
});

test('latencia + url reescrita juntas suben la confianza a alta', () => {
  const clic: ClicParaDetectarEscaner = {
    fechaEvento: '2026-07-29T05:09:07.000Z',
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    detalle: {
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      url: 'https://nam02.safelinks.protection.outlook.com/?url=https%3A%2F%2Fexample.org',
    },
  };
  const v = detectarClicEscaner(clic);
  assert.equal(v.clasificacion, 'probable_escaner');
  assert.equal(v.confianza, 'alta');
  assert.ok(v.senales.includes('latencia_bajo_piso_escaner'));
  assert.ok(v.senales.includes('url_reescrita_por_escaner'));
});

test('url normal de OnePay no dispara la senal de reescritura', () => {
  const clic: ClicParaDetectarEscaner = {
    fechaEvento: '2026-07-29T08:00:00.000Z',
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    detalle: {
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      url: 'https://onepay.com.co/prueba-2-a',
    },
  };
  const v = detectarClicEscaner(clic);
  assert.ok(!v.senales.includes('url_reescrita_por_escaner'));
});

test('url que contiene el dominio del escaner como substring pero en otro host no dispara (evita falso positivo por match laxo)', () => {
  const clic: ClicParaDetectarEscaner = {
    fechaEvento: '2026-07-29T08:00:00.000Z',
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    detalle: {
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      url: 'https://evil-mirror.example/safelinks.protection.outlook.com.attacker.net/x',
    },
  };
  const v = detectarClicEscaner(clic);
  assert.ok(!v.senales.includes('url_reescrita_por_escaner'));
});

test('url no parseable no rompe el detector y no dispara la senal', () => {
  const clic: ClicParaDetectarEscaner = {
    fechaEvento: '2026-07-29T08:00:00.000Z',
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    detalle: {
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      url: 'no-es-una-url-valida',
    },
  };
  const v = detectarClicEscaner(clic);
  assert.ok(!v.senales.includes('url_reescrita_por_escaner'));
  assert.equal(v.clasificacion, 'sin_evidencia_de_escaner');
});

test('sin url en el detalle, la senal no dispara', () => {
  const clic: ClicParaDetectarEscaner = {
    fechaEvento: '2026-07-29T08:00:00.000Z',
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    detalle: { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' },
  };
  const v = detectarClicEscaner(clic);
  assert.ok(!v.senales.includes('url_reescrita_por_escaner'));
});

// --- Senal 3: ua vacio ---

test('ua vacio (cadena vacia) sin otras senales sale sin_evidencia_de_escaner: ua vacio solo no decide', () => {
  const clic: ClicParaDetectarEscaner = {
    fechaEvento: '2026-07-29T08:00:00.000Z',
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    detalle: { ua: '', url: 'https://onepay.com.co/prueba-2-a' },
  };
  const v = detectarClicEscaner(clic);
  assert.equal(v.clasificacion, 'sin_evidencia_de_escaner');
  assert.ok(v.senales.includes('ua_vacio_en_clic'));
});

test('ua null (campo presente pero null) tambien dispara la senal debil sin decidir sola', () => {
  const clic: ClicParaDetectarEscaner = {
    fechaEvento: '2026-07-29T08:00:00.000Z',
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    detalle: { ua: null },
  };
  const v = detectarClicEscaner(clic);
  assert.equal(v.clasificacion, 'sin_evidencia_de_escaner');
  assert.ok(v.senales.includes('ua_vacio_en_clic'));
});

test('detalle null entero tambien cuenta como ua vacio y no decide solo', () => {
  const clic: ClicParaDetectarEscaner = {
    fechaEvento: '2026-07-29T08:00:00.000Z',
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    detalle: null,
  };
  const v = detectarClicEscaner(clic);
  assert.equal(v.clasificacion, 'sin_evidencia_de_escaner');
  assert.ok(v.senales.includes('ua_vacio_en_clic'));
});

test('ua vacio SUMADO a latencia baja sigue siendo probable_escaner (la senal debil no baja el veredicto de la fuerte)', () => {
  const clic: ClicParaDetectarEscaner = {
    fechaEvento: '2026-07-29T05:09:07.000Z',
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    detalle: { ua: '' },
  };
  const v = detectarClicEscaner(clic);
  assert.equal(v.clasificacion, 'probable_escaner');
  assert.ok(v.senales.includes('latencia_bajo_piso_escaner'));
  assert.ok(v.senales.includes('ua_vacio_en_clic'));
  assert.equal(v.confianza, 'media');
});

// --- Sin ninguna senal ---

test('clic limpio sin ninguna senal sale sin_evidencia_de_escaner con senales vacio', () => {
  const clic: ClicParaDetectarEscaner = {
    fechaEvento: '2026-07-29T09:00:00.000Z',
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    detalle: {
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      url: 'https://onepay.com.co/prueba-normal',
    },
  };
  const v = detectarClicEscaner(clic);
  assert.equal(v.clasificacion, 'sin_evidencia_de_escaner');
  assert.deepEqual(v.senales, []);
  assert.equal(v.detalle, 'sin_senales_disparadas');
});

// --- Senal declarada no implementada ---

test('senalIpDatacenterNoImplementada declara el hueco en vez de inventar una heuristica', () => {
  const r = senalIpDatacenterNoImplementada();
  assert.equal(r.implementada, false);
  assert.ok(r.motivo.length > 0);
});
