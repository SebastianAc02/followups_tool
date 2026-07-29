import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acumularMatrizClientes,
  MATRIZ_SEMILLA,
  UMBRAL_N_ENVIOS_CELDA,
  type EnvioParaMatriz,
  type EventoClasificadoParaMatriz,
} from './matriz-clientes-correo.ts';

// Helper: evento base representante de su propio grupo, sin duplicados, sin exclusion.
function evento(parcial: Partial<EventoClasificadoParaMatriz> & Pick<EventoClasificadoParaMatriz, 'idEvento' | 'tipo' | 'fechaEvento'>): EventoClasificadoParaMatriz {
  return {
    ua: null,
    clasificacion: 'desconocido',
    razon: 'sin_huella_capturada',
    excluirDeMetricas: false,
    grupoDedupId: parcial.idEvento,
    esRepresentanteGrupo: true,
    ...parcial,
  };
}

// --- Casos reales medidos en produccion (campana 58, 2026-07-29) ---

test('paso 115 (Gmail: solo el proxy abrio, sin clic) cae en la celda gmail.com/proxy_gmail', () => {
  const envio: EnvioParaMatriz = {
    idPasoInscripcion: 115,
    dominio: 'gmail.com',
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    eventos: [
      evento({
        idEvento: 13,
        tipo: 'abierto',
        fechaEvento: '2026-07-29T07:16:51.747Z',
        ua: 'Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)',
        clasificacion: 'maquina',
        razon: 'proxy_imagenes_gmail',
      }),
    ],
  };
  const [celda] = acumularMatrizClientes([envio]);
  assert.equal(celda.clave.dominio, 'gmail.com');
  assert.equal(celda.clave.superficie, 'proxy_gmail');
  assert.equal(celda.nEnvios, 1);
  assert.equal(celda.conAperturaPixel, 1);
  assert.equal(celda.conClicSinAperturaPrevia, 0);
  assert.equal(celda.origen, 'inferida_fuente_externa');
  assert.equal(celda.divergencia, null);
});

test('paso 114 (Outlook: cero aperturas, un clic humano) cae en clic_directo_navegador, sin pisar la celda de Gmail', () => {
  const envioOutlook: EnvioParaMatriz = {
    idPasoInscripcion: 114,
    dominio: 'outlook.com',
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    eventos: [
      evento({
        idEvento: 15,
        tipo: 'clic',
        fechaEvento: '2026-07-29T07:17:11.372Z',
        ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
        clasificacion: 'humano',
        razon: 'ua_navegador_completo',
      }),
    ],
  };
  const envioGmail: EnvioParaMatriz = {
    idPasoInscripcion: 115,
    dominio: 'gmail.com',
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    eventos: [
      evento({
        idEvento: 13,
        tipo: 'abierto',
        fechaEvento: '2026-07-29T07:16:51.747Z',
        ua: 'Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)',
        clasificacion: 'maquina',
        razon: 'proxy_imagenes_gmail',
      }),
      evento({
        idEvento: 14,
        tipo: 'clic',
        fechaEvento: '2026-07-29T07:16:56.808Z',
        ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5.2 Mobile/15E148 Safari/604.1',
        clasificacion: 'humano',
        razon: 'ua_navegador_completo',
      }),
    ],
  };

  const celdas = acumularMatrizClientes([envioOutlook, envioGmail]);
  assert.equal(celdas.length, 2);

  const outlook = celdas.find((c) => c.clave.dominio === 'outlook.com')!;
  assert.equal(outlook.clave.superficie, 'clic_directo_navegador');
  assert.equal(outlook.conAperturaPixel, 0);
  assert.equal(outlook.conClicSinAperturaPrevia, 1);

  const gmail = celdas.find((c) => c.clave.dominio === 'gmail.com')!;
  // El abierto (proxy) gana la precedencia sobre el clic humano para determinar la superficie:
  // el envio tuvo abierto, asi que cae en proxy_gmail, no en clic_directo_navegador.
  assert.equal(gmail.clave.superficie, 'proxy_gmail');
  assert.equal(gmail.conAperturaPixel, 1);
  // El clic llego DESPUES del abierto (07:16:56 > 07:16:51), asi que no cuenta como "sin apertura previa".
  assert.equal(gmail.conClicSinAperturaPrevia, 0);
});

test('un clic que llega ANTES que la apertura del mismo envio cuenta como sin apertura previa, aunque el envio termine en la celda proxy_gmail', () => {
  const envio: EnvioParaMatriz = {
    idPasoInscripcion: 900,
    dominio: 'gmail.com',
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    eventos: [
      evento({
        idEvento: 1,
        tipo: 'clic',
        fechaEvento: '2026-07-29T07:16:50.000Z',
        ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
        clasificacion: 'humano',
        razon: 'ua_navegador_completo',
      }),
      evento({
        idEvento: 2,
        tipo: 'abierto',
        fechaEvento: '2026-07-29T07:16:55.000Z',
        ua: 'Mozilla/5.0 (via ggpht.com GoogleImageProxy)',
        clasificacion: 'maquina',
        razon: 'proxy_imagenes_gmail',
      }),
    ],
  };
  const [celda] = acumularMatrizClientes([envio]);
  assert.equal(celda.clave.superficie, 'proxy_gmail');
  assert.equal(celda.conClicSinAperturaPrevia, 1);
});

test('eventos 6-10 (sin ua, captura no existia) caen en pixel_sin_huella, nunca en maquina ni en una celda que sugiera humano', () => {
  const envio: EnvioParaMatriz = {
    idPasoInscripcion: 113,
    dominio: 'eafit.edu.co',
    fechaEnvio: null,
    eventos: [
      evento({ idEvento: 6, tipo: 'abierto', fechaEvento: '2026-07-27T10:00:00.000Z', razon: 'sin_huella_capturada' }),
    ],
  };
  const [celda] = acumularMatrizClientes([envio]);
  assert.equal(celda.clave.dominio, 'eafit.edu.co');
  assert.equal(celda.clave.superficie, 'pixel_sin_huella');
});

test('un envio cuyo unico evento es trafico de prueba interno queda completamente afuera de la matriz', () => {
  const envio: EnvioParaMatriz = {
    idPasoInscripcion: 999,
    dominio: 'gmail.com',
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    eventos: [
      evento({
        idEvento: 11,
        tipo: 'abierto',
        fechaEvento: '2026-07-29T07:00:00.000Z',
        ua: 'VERIFICACION-AGENTE',
        clasificacion: 'maquina',
        razon: 'trafico_prueba_interno',
        excluirDeMetricas: true,
      }),
    ],
  };
  const celdas = acumularMatrizClientes([envio]);
  assert.equal(celdas.length, 0);
});

// --- Duplicados: mismo ua vs ua distinto (hueco 1 de la investigacion, cerrado dentro de este modulo) ---

test('eventos 8 y 9 (duplicado tecnico, 5ms de diferencia, sin ua porque la captura no existia) sale ua indeterminado, no mismo_ua ni distinto', () => {
  const envio: EnvioParaMatriz = {
    idPasoInscripcion: 113,
    dominio: 'eafit.edu.co',
    fechaEnvio: null,
    eventos: [
      evento({ idEvento: 8, tipo: 'abierto', fechaEvento: '2026-07-27T10:05:00.000Z', razon: 'sin_huella_capturada', grupoDedupId: 8, esRepresentanteGrupo: true }),
      evento({ idEvento: 9, tipo: 'abierto', fechaEvento: '2026-07-27T10:05:00.005Z', razon: 'sin_huella_capturada', grupoDedupId: 8, esRepresentanteGrupo: false }),
    ],
  };
  const [celda] = acumularMatrizClientes([envio]);
  assert.equal(celda.duplicadosUaIndeterminado, 1);
  assert.equal(celda.duplicadosMismoUa, 0);
  assert.equal(celda.duplicadosUaDistinto, 0);
});

test('dos eventos del mismo grupo con el mismo ua cuentan como duplicadosMismoUa', () => {
  const uaComun = 'Mozilla/5.0 (via ggpht.com GoogleImageProxy)';
  const envio: EnvioParaMatriz = {
    idPasoInscripcion: 200,
    dominio: 'gmail.com',
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    eventos: [
      evento({ idEvento: 20, tipo: 'abierto', fechaEvento: '2026-07-29T07:00:00.000Z', ua: uaComun, clasificacion: 'maquina', razon: 'proxy_imagenes_gmail', grupoDedupId: 20, esRepresentanteGrupo: true }),
      evento({ idEvento: 21, tipo: 'abierto', fechaEvento: '2026-07-29T07:00:00.500Z', ua: uaComun, clasificacion: 'maquina', razon: 'proxy_imagenes_gmail', grupoDedupId: 20, esRepresentanteGrupo: false }),
    ],
  };
  const [celda] = acumularMatrizClientes([envio]);
  assert.equal(celda.duplicadosMismoUa, 1);
  assert.equal(celda.duplicadosUaDistinto, 0);
});

test('dos eventos del mismo grupo con ua DISTINTO cuentan como duplicadosUaDistinto (dos fetchers, no un doble fetch)', () => {
  const envio: EnvioParaMatriz = {
    idPasoInscripcion: 201,
    dominio: 'gmail.com',
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    eventos: [
      evento({ idEvento: 30, tipo: 'abierto', fechaEvento: '2026-07-29T07:00:00.000Z', ua: 'Mozilla/5.0 (via ggpht.com GoogleImageProxy)', clasificacion: 'maquina', razon: 'proxy_imagenes_gmail', grupoDedupId: 30, esRepresentanteGrupo: true }),
      evento({ idEvento: 31, tipo: 'abierto', fechaEvento: '2026-07-29T07:00:00.900Z', ua: 'Mozilla/5.0 (algun-otro-fetcher)', clasificacion: 'desconocido', razon: 'ua_no_clasificable', grupoDedupId: 30, esRepresentanteGrupo: false }),
    ],
  };
  const [celda] = acumularMatrizClientes([envio]);
  assert.equal(celda.duplicadosUaDistinto, 1);
  assert.equal(celda.duplicadosMismoUa, 0);
});

test('un grupo con un solo evento (sin duplicado real) no suma a ningun contador de duplicados', () => {
  const envio: EnvioParaMatriz = {
    idPasoInscripcion: 202,
    dominio: 'gmail.com',
    fechaEnvio: '2026-07-29T05:09:05.000Z',
    eventos: [evento({ idEvento: 40, tipo: 'abierto', fechaEvento: '2026-07-29T07:00:00.000Z', ua: 'x', razon: 'proxy_imagenes_gmail', clasificacion: 'maquina' })],
  };
  const [celda] = acumularMatrizClientes([envio]);
  assert.equal(celda.duplicadosMismoUa, 0);
  assert.equal(celda.duplicadosUaDistinto, 0);
  assert.equal(celda.duplicadosUaIndeterminado, 0);
});

// --- Latencia ---

test('latenciaMedianaMs es la mediana de (primer evento - fecha_envio) entre los envios de la celda', () => {
  const base = '2026-07-29T05:00:00.000Z';
  const envios: EnvioParaMatriz[] = [
    { idPasoInscripcion: 1, dominio: 'gmail.com', fechaEnvio: base, eventos: [evento({ idEvento: 1, tipo: 'abierto', fechaEvento: '2026-07-29T05:00:10.000Z', razon: 'proxy_imagenes_gmail', clasificacion: 'maquina' })] },
    { idPasoInscripcion: 2, dominio: 'gmail.com', fechaEnvio: base, eventos: [evento({ idEvento: 2, tipo: 'abierto', fechaEvento: '2026-07-29T05:00:20.000Z', razon: 'proxy_imagenes_gmail', clasificacion: 'maquina' })] },
    { idPasoInscripcion: 3, dominio: 'gmail.com', fechaEnvio: base, eventos: [evento({ idEvento: 3, tipo: 'abierto', fechaEvento: '2026-07-29T05:00:30.000Z', razon: 'proxy_imagenes_gmail', clasificacion: 'maquina' })] },
  ];
  const [celda] = acumularMatrizClientes(envios);
  assert.equal(celda.latenciaMedianaMs, 20000); // 10s, 20s, 30s -> mediana 20s
  assert.equal(celda.nEnviosConLatencia, 3);
});

test('sin fecha_envio conocida, latenciaMedianaMs es null y no se inventa un cero', () => {
  const envio: EnvioParaMatriz = {
    idPasoInscripcion: 4,
    dominio: 'gmail.com',
    fechaEnvio: null,
    eventos: [evento({ idEvento: 4, tipo: 'abierto', fechaEvento: '2026-07-29T05:00:10.000Z', razon: 'proxy_imagenes_gmail', clasificacion: 'maquina' })],
  };
  const [celda] = acumularMatrizClientes([envio]);
  assert.equal(celda.latenciaMedianaMs, null);
  assert.equal(celda.nEnviosConLatencia, 0);
});

// --- Umbral de N y origen de la celda ---

test('por debajo del umbral, la celda sale inferida_fuente_externa aunque tenga varios envios', () => {
  const envios: EnvioParaMatriz[] = Array.from({ length: UMBRAL_N_ENVIOS_CELDA - 1 }, (_, i) => ({
    idPasoInscripcion: i,
    dominio: 'gmail.com',
    fechaEnvio: '2026-07-29T05:00:00.000Z',
    eventos: [evento({ idEvento: i, tipo: 'abierto', fechaEvento: '2026-07-29T05:00:10.000Z', razon: 'proxy_imagenes_gmail', clasificacion: 'maquina' })],
  }));
  const [celda] = acumularMatrizClientes(envios);
  assert.equal(celda.nEnvios, UMBRAL_N_ENVIOS_CELDA - 1);
  assert.equal(celda.origen, 'inferida_fuente_externa');
});

test('al cruzar el umbral, la celda pasa a medida_datos_propios', () => {
  const envios: EnvioParaMatriz[] = Array.from({ length: UMBRAL_N_ENVIOS_CELDA }, (_, i) => ({
    idPasoInscripcion: i,
    dominio: 'gmail.com',
    fechaEnvio: '2026-07-29T05:00:00.000Z',
    eventos: [evento({ idEvento: i, tipo: 'abierto', fechaEvento: '2026-07-29T05:00:10.000Z', razon: 'proxy_imagenes_gmail', clasificacion: 'maquina' })],
  }));
  const [celda] = acumularMatrizClientes(envios);
  assert.equal(celda.nEnvios, UMBRAL_N_ENVIOS_CELDA);
  assert.equal(celda.origen, 'medida_datos_propios');
});

// --- Divergencia contra la semilla ---

test('un pixel de gmail.com disparado con ua de navegador limpio (sin proxy) se marca como divergencia, no se pisa en silencio', () => {
  const envio: EnvioParaMatriz = {
    idPasoInscripcion: 500,
    dominio: 'gmail.com',
    fechaEnvio: '2026-07-29T05:00:00.000Z',
    eventos: [
      evento({
        idEvento: 50,
        tipo: 'abierto',
        fechaEvento: '2026-07-29T05:00:05.000Z',
        ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
        clasificacion: 'humano',
        razon: 'ua_navegador_completo',
      }),
    ],
  };
  const [celda] = acumularMatrizClientes([envio]);
  assert.equal(celda.clave.superficie, 'pixel_directo_navegador');
  assert.ok(celda.divergencia !== null);
  assert.match(celda.divergencia!.descripcion, /gmail\.com/);
  // La divergencia se reporta aunque la celda siga inferida (n=1, muy por debajo del umbral):
  // no hace falta cruzar UMBRAL_N_ENVIOS_CELDA para que un caso puntual sea noticia.
  assert.equal(celda.origen, 'inferida_fuente_externa');
});

test('proxy_gmail en gmail.com (el patron esperado) nunca genera divergencia', () => {
  const envio: EnvioParaMatriz = {
    idPasoInscripcion: 501,
    dominio: 'gmail.com',
    fechaEnvio: '2026-07-29T05:00:00.000Z',
    eventos: [evento({ idEvento: 51, tipo: 'abierto', fechaEvento: '2026-07-29T05:00:05.000Z', razon: 'proxy_imagenes_gmail', clasificacion: 'maquina' })],
  };
  const [celda] = acumularMatrizClientes([envio]);
  assert.equal(celda.divergencia, null);
});

test('pixel_directo_navegador en un dominio que no es gmail no genera divergencia (no hay expectativa dura para ese dominio)', () => {
  const envio: EnvioParaMatriz = {
    idPasoInscripcion: 502,
    dominio: 'un-isp-cualquiera.com.co',
    fechaEnvio: '2026-07-29T05:00:00.000Z',
    eventos: [
      evento({
        idEvento: 52,
        tipo: 'abierto',
        fechaEvento: '2026-07-29T05:00:05.000Z',
        ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
        clasificacion: 'humano',
        razon: 'ua_navegador_completo',
      }),
    ],
  };
  const [celda] = acumularMatrizClientes([envio]);
  assert.equal(celda.divergencia, null);
});

// --- Envios sin señal usable ---

test('un envio con un unico evento tipo visto, sin abierto ni clic, cae en sin_evidencia_util', () => {
  const envio: EnvioParaMatriz = {
    idPasoInscripcion: 600,
    dominio: 'gmail.com',
    fechaEnvio: '2026-07-29T05:00:00.000Z',
    eventos: [evento({ idEvento: 60, tipo: 'visto', fechaEvento: '2026-07-29T05:00:05.000Z' })],
  };
  const [celda] = acumularMatrizClientes([envio]);
  assert.equal(celda.clave.superficie, 'sin_evidencia_util');
});

test('una lista vacia de envios devuelve una matriz vacia, sin reventar', () => {
  assert.deepEqual(acumularMatrizClientes([]), []);
});

// --- Sanidad de la semilla ---

test('toda fila de MATRIZ_SEMILLA marcada verificado tiene una fuente no vacia citada', () => {
  for (const fila of MATRIZ_SEMILLA) {
    if (fila.estado === 'verificado') {
      assert.ok(fila.fuente.length > 0, `fila ${fila.id} sin fuente`);
    }
  }
});

test('ninguna fila de la semilla reporta un porcentaje propio medido: solo cita rangos externos con su fuente', () => {
  for (const fila of MATRIZ_SEMILLA) {
    // Regla dura del operador: nunca un % que parezca medicion propia. La unica cifra que
    // aparece en toda la semilla es el 1-6% de Everlytic, citado con su fuente explicita en la
    // misma fila -- no es un numero nuestro.
    if (/%/.test(fila.descripcion + (fila.notas ?? ''))) {
      assert.match(fila.fuente + (fila.notas ?? ''), /Everlytic/);
    }
  }
});

test('MATRIZ_SEMILLA no tiene ids repetidos', () => {
  const ids = MATRIZ_SEMILLA.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
});
