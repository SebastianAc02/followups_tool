import test from 'node:test';
import assert from 'node:assert/strict';
import { clasificarEvento, type EventoParaClasificar } from './clasificar-evento-tracking.ts';
import { cruzarAperturaClic, type EventoParaCruce } from './cruzar-apertura-clic.ts';

// --- Casos reales medidos en produccion (campana 58, envio 2026-07-29T05:09:05Z) ---
// Los eventos se clasifican con clasificarEvento (la funcion real, no se reimplementa nada) y
// el resultado se pasa tal cual a cruzarAperturaClic.

const FECHA_ENVIO_115 = '2026-07-29T05:09:05Z';

test('paso 114 (Outlook: cero aperturas, un clic humano real) da leyo y el pixel nunca salio', () => {
  const evento15: EventoParaClasificar = {
    idEvento: 15,
    tipo: 'clic',
    fechaEvento: '2026-07-29T07:17:11.372Z',
    fechaEnvio: FECHA_ENVIO_115,
    detalle: {
      ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
      ip: '181.58.39.167',
      url: 'https://example.org/prueba-2-b',
    },
  };
  const clasificado = clasificarEvento(evento15);
  assert.equal(clasificado.clasificacion, 'humano'); // sanity: sigue siendo lo que ya prueba clasificar-evento-tracking.test.ts

  const eventos: EventoParaCruce[] = [{ tipo: 'clic', clasificacion: clasificado.clasificacion }];
  const veredicto = cruzarAperturaClic(eventos);

  assert.equal(veredicto.estado, 'lectura_confirmada_clic_pixel_nunca_salio');
  assert.equal(veredicto.lectura, 'confirmada');
  assert.equal(veredicto.causa_medibilidad, 'pixel_nunca_salio');
  assert.equal(veredicto.pixel_se_disparo, false);
  assert.equal(veredicto.cliente_no_medible_por_pixel, true);
  assert.equal(veredicto.apertura_sube_de_rango, false);
  assert.equal(veredicto.metodo_confirmacion, 'clic_humano');
});

test('paso 115 (Gmail: apertura de proxy + clic humano real) da lectura confirmada, la apertura era de maquina', () => {
  const evento13: EventoParaClasificar = {
    idEvento: 13,
    tipo: 'abierto',
    fechaEvento: '2026-07-29T07:16:51.747Z',
    fechaEnvio: FECHA_ENVIO_115,
    detalle: {
      via: 'pixel',
      ua: 'Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)',
      ip: '74.125.210.129',
    },
  };
  const evento14: EventoParaClasificar = {
    idEvento: 14,
    tipo: 'clic',
    fechaEvento: '2026-07-29T07:16:56.808Z',
    fechaEnvio: FECHA_ENVIO_115,
    detalle: {
      ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5.2 Mobile/15E148 Safari/604.1',
      ip: '172.226.172.5',
      url: 'https://example.org/prueba-2-a',
    },
  };
  const clasificado13 = clasificarEvento(evento13);
  const clasificado14 = clasificarEvento(evento14);
  assert.equal(clasificado13.clasificacion, 'maquina');
  assert.equal(clasificado13.razon, 'proxy_imagenes_gmail');
  assert.equal(clasificado14.clasificacion, 'humano');

  const eventos: EventoParaCruce[] = [
    { tipo: 'abierto', clasificacion: clasificado13.clasificacion },
    { tipo: 'clic', clasificacion: clasificado14.clasificacion },
  ];
  const veredicto = cruzarAperturaClic(eventos);

  assert.equal(veredicto.estado, 'lectura_confirmada_clic_apertura_maquina');
  assert.equal(veredicto.lectura, 'confirmada');
  assert.equal(veredicto.causa_medibilidad, 'solo_apertura_de_maquina');
  assert.equal(veredicto.pixel_se_disparo, true);
  assert.equal(veredicto.apertura_sube_de_rango, true); // R2: la apertura de maquina sube de rango
  assert.equal(veredicto.cliente_no_medible_por_pixel, false); // el pixel si se disparo
});

test('paso 113 (EAFIT: aperturas sin huella capturada, sin clic) da no se puede saber, jamas no lo abrio', () => {
  // Eventos 6-10 reales: previos al 2026-07-28, sin UA porque la captura no existia todavia.
  const eventoSinHuella: EventoParaClasificar = {
    idEvento: 6,
    tipo: 'abierto',
    fechaEvento: '2026-07-27T09:00:00.000Z',
    detalle: null,
  };
  const clasificado = clasificarEvento(eventoSinHuella);
  assert.equal(clasificado.clasificacion, 'desconocido');
  assert.equal(clasificado.razon, 'sin_huella_capturada');

  const eventos: EventoParaCruce[] = [{ tipo: 'abierto', clasificacion: clasificado.clasificacion }];
  const veredicto = cruzarAperturaClic(eventos);

  assert.equal(veredicto.estado, 'no_se_puede_saber_apertura_sin_huella');
  assert.equal(veredicto.lectura, 'no_se_puede_saber');
  assert.equal(veredicto.causa_medibilidad, 'apertura_sin_huella_capturada');
  assert.equal(veredicto.pixel_se_disparo, true);
  assert.equal(veredicto.apertura_sube_de_rango, false);
  assert.equal(veredicto.cliente_no_medible_por_pixel, false);
  // Nunca "no lo abrio": ni el estado ni la explicacion pueden afirmar eso.
  assert.doesNotMatch(veredicto.estado, /no_lo_abrio|no_abrio|no_leyo/);
  assert.doesNotMatch(veredicto.explicacion.toLowerCase(), /no lo abrio|no lo leyo/);
});

// --- Combinaciones puras, sin pasar por clasificarEvento (para cubrir ramas que la produccion
// todavia no genero pero el diseno tiene que resolver igual) ---

test('apertura humana directa sin clic: lectura confirmada por apertura', () => {
  const veredicto = cruzarAperturaClic([{ tipo: 'abierto', clasificacion: 'humano' }]);
  assert.equal(veredicto.estado, 'lectura_confirmada_apertura_humana');
  assert.equal(veredicto.lectura, 'confirmada');
  assert.equal(veredicto.metodo_confirmacion, 'apertura_humana');
  assert.equal(veredicto.causa_medibilidad, 'apertura_humana_directa');
  assert.equal(veredicto.cliente_no_medible_por_pixel, false);
});

test('apertura humana directa Y clic humano: sigue confirmada, metodo reporta los dos', () => {
  const veredicto = cruzarAperturaClic([
    { tipo: 'abierto', clasificacion: 'humano' },
    { tipo: 'clic', clasificacion: 'humano' },
  ]);
  assert.equal(veredicto.estado, 'lectura_confirmada_apertura_humana');
  assert.equal(veredicto.metodo_confirmacion, 'apertura_humana_y_clic_humano');
  assert.equal(veredicto.apertura_sube_de_rango, false); // ya estaba confirmada, no necesito subir de rango
});

test('solo apertura de maquina, sin clic: no se puede saber', () => {
  const veredicto = cruzarAperturaClic([{ tipo: 'abierto', clasificacion: 'maquina' }]);
  assert.equal(veredicto.estado, 'no_se_puede_saber_solo_apertura_maquina');
  assert.equal(veredicto.lectura, 'no_se_puede_saber');
  assert.equal(veredicto.causa_medibilidad, 'solo_apertura_de_maquina');
  assert.equal(veredicto.pixel_se_disparo, true);
});

test('cero eventos: pixel nunca salio, no se puede saber', () => {
  const veredicto = cruzarAperturaClic([]);
  assert.equal(veredicto.estado, 'no_se_puede_saber_pixel_nunca_salio');
  assert.equal(veredicto.lectura, 'no_se_puede_saber');
  assert.equal(veredicto.causa_medibilidad, 'pixel_nunca_salio');
  assert.equal(veredicto.pixel_se_disparo, false);
  assert.equal(veredicto.cliente_no_medible_por_pixel, true);
});

test('un clic de maquina (escaner) solo, sin apertura, no confirma lectura', () => {
  const veredicto = cruzarAperturaClic([{ tipo: 'clic', clasificacion: 'maquina' }]);
  assert.equal(veredicto.lectura, 'no_se_puede_saber');
  assert.equal(veredicto.estado, 'no_se_puede_saber_pixel_nunca_salio');
});

test('un clic desconocido solo, sin apertura, no confirma lectura (barra alta a proposito: solo humano confirma)', () => {
  const veredicto = cruzarAperturaClic([{ tipo: 'clic', clasificacion: 'desconocido' }]);
  assert.equal(veredicto.lectura, 'no_se_puede_saber');
  assert.equal(veredicto.estado, 'no_se_puede_saber_pixel_nunca_salio');
});

test('evento tipo visto no participa del cruce (no es abierto ni clic)', () => {
  const veredicto = cruzarAperturaClic([{ tipo: 'visto', clasificacion: 'humano' }]);
  assert.equal(veredicto.lectura, 'no_se_puede_saber');
  assert.equal(veredicto.causa_medibilidad, 'pixel_nunca_salio');
});
