import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clasificarEvento,
  deduplicarEventos,
  estadoMedibilidadEnvio,
  dominiosConAvisoNoMedible,
  type EventoParaClasificar,
} from './clasificar-evento-tracking.ts';

// --- Casos reales medidos en produccion (campana 58, 2026-07-29) ---

test('evento 13 (Gmail, proxy de imagenes) sale maquina', () => {
  const evento: EventoParaClasificar = {
    idEvento: 13,
    tipo: 'abierto',
    fechaEvento: '2026-07-29T07:16:51.747Z',
    detalle: {
      via: 'pixel',
      ua: 'Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)',
      ip: '74.125.210.129',
    },
  };
  const v = clasificarEvento(evento);
  assert.equal(v.clasificacion, 'maquina');
  assert.equal(v.razon, 'proxy_imagenes_gmail');
  assert.equal(v.confianza, 'alta');
  assert.equal(v.excluir_de_metricas, false);
});

test('evento 14 (clic desde iPhone real) sale humano', () => {
  const evento: EventoParaClasificar = {
    idEvento: 14,
    tipo: 'clic',
    fechaEvento: '2026-07-29T07:16:56.808Z',
    detalle: {
      ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5.2 Mobile/15E148 Safari/604.1',
      ip: '172.226.172.5',
      url: 'https://example.org/prueba-2-a',
    },
  };
  const v = clasificarEvento(evento);
  assert.equal(v.clasificacion, 'humano');
  assert.equal(v.razon, 'ua_navegador_completo');
});

test('evento 15 (clic desde Mac real) sale humano', () => {
  const evento: EventoParaClasificar = {
    idEvento: 15,
    tipo: 'clic',
    fechaEvento: '2026-07-29T07:17:11.372Z',
    detalle: {
      ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
      ip: '181.58.39.167',
      url: 'https://example.org/prueba-2-b',
    },
  };
  const v = clasificarEvento(evento);
  assert.equal(v.clasificacion, 'humano');
  assert.equal(v.razon, 'ua_navegador_completo');
});

test('eventos 11-12 (trafico de prueba interno) salen maquina y se excluyen de metricas', () => {
  const evento: EventoParaClasificar = {
    idEvento: 11,
    tipo: 'abierto',
    fechaEvento: '2026-07-28T12:00:00.000Z',
    detalle: { ua: 'curl/8.0 VERIFICACION-AGENTE-2026-07-28' },
  };
  const v = clasificarEvento(evento);
  assert.equal(v.clasificacion, 'maquina');
  assert.equal(v.razon, 'trafico_prueba_interno');
  assert.equal(v.excluir_de_metricas, true);
});

test('eventos 6-10 (sin UA, captura no existia antes del 2026-07-28) salen desconocido', () => {
  const evento: EventoParaClasificar = {
    idEvento: 6,
    tipo: 'abierto',
    fechaEvento: '2026-07-27T20:29:00.000Z',
    detalle: null,
  };
  const v = clasificarEvento(evento);
  assert.equal(v.clasificacion, 'desconocido');
  assert.equal(v.razon, 'sin_huella_capturada');
  assert.equal(v.confianza, 'alta');
});

// --- Reglas, en orden de precedencia ---

test('R3: latencia bajo el piso fisico (delta < 1000ms) sale maquina', () => {
  const evento: EventoParaClasificar = {
    idEvento: 100,
    tipo: 'abierto',
    fechaEvento: '2026-07-29T07:00:00.500Z',
    fechaEnvio: '2026-07-29T07:00:00.000Z',
    detalle: { ua: 'algun-user-agent-cualquiera' },
  };
  const v = clasificarEvento(evento);
  assert.equal(v.clasificacion, 'maquina');
  assert.equal(v.razon, 'latencia_bajo_piso_fisico');
  assert.equal(v.senal, 'latencia_ms:500');
});

test('R3 no aplica a tipo visto', () => {
  const evento: EventoParaClasificar = {
    idEvento: 101,
    tipo: 'visto',
    fechaEvento: '2026-07-29T07:00:00.500Z',
    fechaEnvio: '2026-07-29T07:00:00.000Z',
    detalle: { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36' },
  };
  const v = clasificarEvento(evento);
  assert.notEqual(v.razon, 'latencia_bajo_piso_fisico');
});

test('R4: Mozilla/5.0 pelado, igualdad exacta, sale maquina con confianza media', () => {
  const evento: EventoParaClasificar = {
    idEvento: 102,
    tipo: 'abierto',
    fechaEvento: '2026-07-29T07:00:00.000Z',
    detalle: { ua: 'Mozilla/5.0' },
  };
  const v = clasificarEvento(evento);
  assert.equal(v.clasificacion, 'maquina');
  assert.equal(v.razon, 'candidato_proxy_apple_mpp');
  assert.equal(v.confianza, 'media');
});

test('R4 no matchea si el string trae algo mas (paren o motor)', () => {
  const evento: EventoParaClasificar = {
    idEvento: 103,
    tipo: 'abierto',
    fechaEvento: '2026-07-29T07:00:00.000Z',
    detalle: { ua: 'Mozilla/5.0 (compatible)' },
  };
  const v = clasificarEvento(evento);
  assert.notEqual(v.razon, 'candidato_proxy_apple_mpp');
});

test('R5: ip en rango Apple Private Relay sale maquina (regla inerte hoy pero probada)', () => {
  const evento: EventoParaClasificar = {
    idEvento: 104,
    tipo: 'abierto',
    fechaEvento: '2026-07-29T07:00:00.000Z',
    detalle: { ua: 'Mozilla/5.0 (algo raro)', ip: '172.224.0.1' },
    ipEnRangoApplePrivateRelay: true,
  };
  const v = clasificarEvento(evento);
  assert.equal(v.clasificacion, 'maquina');
  assert.equal(v.razon, 'egress_privaterelay_mpp');
});

test('R5 con null (default v1) no dispara, cae a las reglas siguientes', () => {
  const evento: EventoParaClasificar = {
    idEvento: 105,
    tipo: 'abierto',
    fechaEvento: '2026-07-29T07:00:00.000Z',
    detalle: { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36' },
    ipEnRangoApplePrivateRelay: null,
  };
  const v = clasificarEvento(evento);
  assert.equal(v.razon, 'ua_navegador_completo');
});

test('R7: UA de navegador completo generico sale humano con confianza media', () => {
  const evento: EventoParaClasificar = {
    idEvento: 106,
    tipo: 'abierto',
    fechaEvento: '2026-07-29T07:00:00.000Z',
    detalle: { ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
  };
  const v = clasificarEvento(evento);
  assert.equal(v.clasificacion, 'humano');
  assert.equal(v.confianza, 'media');
});

test('R8: UA presente pero no reconocido sale desconocido con confianza baja', () => {
  const evento: EventoParaClasificar = {
    idEvento: 107,
    tipo: 'abierto',
    fechaEvento: '2026-07-29T07:00:00.000Z',
    detalle: { ua: 'ElInvento3000/1.0' },
  };
  const v = clasificarEvento(evento);
  assert.equal(v.clasificacion, 'desconocido');
  assert.equal(v.razon, 'ua_no_clasificable');
  assert.equal(v.confianza, 'baja');
});

test('precedencia: R1 le gana a R2 si el UA contiene las dos firmas', () => {
  const evento: EventoParaClasificar = {
    idEvento: 108,
    tipo: 'abierto',
    fechaEvento: '2026-07-29T07:00:00.000Z',
    detalle: { ua: 'VERIFICACION-AGENTE-2026-07-28 GoogleImageProxy' },
  };
  const v = clasificarEvento(evento);
  assert.equal(v.razon, 'trafico_prueba_interno');
});

test('precedencia: R2 le gana a R3 aunque la latencia tambien sea baja', () => {
  const evento: EventoParaClasificar = {
    idEvento: 109,
    tipo: 'abierto',
    fechaEvento: '2026-07-29T07:00:00.100Z',
    fechaEnvio: '2026-07-29T07:00:00.000Z',
    detalle: { ua: 'algo (via ggpht.com GoogleImageProxy)' },
  };
  const v = clasificarEvento(evento);
  assert.equal(v.razon, 'proxy_imagenes_gmail');
});

// --- Casos borde ---

test('UA vacio (cadena vacia) sale desconocido por sin_huella_capturada', () => {
  const evento: EventoParaClasificar = {
    idEvento: 200,
    tipo: 'abierto',
    fechaEvento: '2026-07-29T07:00:00.000Z',
    detalle: { ua: '' },
  };
  const v = clasificarEvento(evento);
  assert.equal(v.clasificacion, 'desconocido');
  assert.equal(v.razon, 'sin_huella_capturada');
});

test('UA null (campo presente pero null) sale desconocido', () => {
  const evento: EventoParaClasificar = {
    idEvento: 201,
    tipo: 'abierto',
    fechaEvento: '2026-07-29T07:00:00.000Z',
    detalle: { ua: null, ip: '1.2.3.4' },
  };
  const v = clasificarEvento(evento);
  assert.equal(v.razon, 'sin_huella_capturada');
});

test('detalle null entero (nunca se capturo nada) sale desconocido', () => {
  const evento: EventoParaClasificar = {
    idEvento: 202,
    tipo: 'abierto',
    fechaEvento: '2026-07-29T07:00:00.000Z',
    detalle: null,
  };
  const v = clasificarEvento(evento);
  assert.equal(v.razon, 'sin_huella_capturada');
  assert.equal(v.senal, 'detalle:null');
});

test('IP null no rompe nada, la clasificacion depende del UA', () => {
  const evento: EventoParaClasificar = {
    idEvento: 203,
    tipo: 'clic',
    fechaEvento: '2026-07-29T07:00:00.000Z',
    detalle: {
      ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5.2 Mobile/15E148 Safari/604.1',
      ip: null,
    },
  };
  const v = clasificarEvento(evento);
  assert.equal(v.clasificacion, 'humano');
});

test('substring de firma en otro contexto igual dispara la regla: el patron es literal, sin limite de palabra', () => {
  const evento: EventoParaClasificar = {
    idEvento: 204,
    tipo: 'abierto',
    fechaEvento: '2026-07-29T07:00:00.000Z',
    detalle: { ua: 'sub.ggpht.com.evil-mirror.example/bot' },
  };
  const v = clasificarEvento(evento);
  assert.equal(v.razon, 'proxy_imagenes_gmail');
});

test('UA que menciona GoogleImageProxy dentro de un comentario mas largo sigue siendo R2, no R7 ni R8', () => {
  const evento: EventoParaClasificar = {
    idEvento: 205,
    tipo: 'abierto',
    fechaEvento: '2026-07-29T07:00:00.000Z',
    detalle: { ua: 'Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)' },
  };
  const v = clasificarEvento(evento);
  assert.equal(v.clasificacion, 'maquina');
  assert.equal(v.razon, 'proxy_imagenes_gmail');
});

test('R4 no confunde un UA que empieza igual pero tiene mas texto pegado sin espacio', () => {
  const evento: EventoParaClasificar = {
    idEvento: 206,
    tipo: 'abierto',
    fechaEvento: '2026-07-29T07:00:00.000Z',
    detalle: { ua: 'Mozilla/5.0-custom' },
  };
  const v = clasificarEvento(evento);
  assert.notEqual(v.razon, 'candidato_proxy_apple_mpp');
});

test('fecha_envio ausente no dispara R3 aunque el evento sea muy pegado a otra referencia', () => {
  const evento: EventoParaClasificar = {
    idEvento: 207,
    tipo: 'abierto',
    fechaEvento: '2026-07-29T07:00:00.001Z',
    detalle: { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36' },
  };
  const v = clasificarEvento(evento);
  assert.notEqual(v.razon, 'latencia_bajo_piso_fisico');
  assert.equal(v.clasificacion, 'humano');
});

// --- Deduplicacion ---

test('eventos 8 y 9 (5ms de diferencia, mismo paso, misma apertura) se agrupan bajo el mas temprano', () => {
  const grupos = deduplicarEventos([
    { idEvento: 8, idPasoInscripcion: 113, tipo: 'abierto', fechaEvento: '2026-07-27T20:29:56.000Z', ip: null },
    { idEvento: 9, idPasoInscripcion: 113, tipo: 'abierto', fechaEvento: '2026-07-27T20:29:56.005Z', ip: null },
  ]);
  const g8 = grupos.find((g) => g.idEvento === 8)!;
  const g9 = grupos.find((g) => g.idEvento === 9)!;
  assert.equal(g8.grupoDedupId, 8);
  assert.equal(g8.esRepresentanteGrupo, true);
  assert.equal(g9.grupoDedupId, 8);
  assert.equal(g9.esRepresentanteGrupo, false);
});

test('evento sin duplicados es su propio representante', () => {
  const grupos = deduplicarEventos([
    { idEvento: 50, idPasoInscripcion: 200, tipo: 'clic', fechaEvento: '2026-07-29T08:00:00.000Z', ip: '1.1.1.1' },
  ]);
  assert.equal(grupos[0].grupoDedupId, 50);
  assert.equal(grupos[0].esRepresentanteGrupo, true);
});

test('mas de 2000ms de distancia no se agrupan', () => {
  const grupos = deduplicarEventos([
    { idEvento: 60, idPasoInscripcion: 300, tipo: 'abierto', fechaEvento: '2026-07-29T08:00:00.000Z', ip: null },
    { idEvento: 61, idPasoInscripcion: 300, tipo: 'abierto', fechaEvento: '2026-07-29T08:00:02.001Z', ip: null },
  ]);
  assert.equal(grupos.find((g) => g.idEvento === 61)!.esRepresentanteGrupo, true);
});

test('exactamente 2000ms si se agrupan (ventana inclusiva)', () => {
  const grupos = deduplicarEventos([
    { idEvento: 62, idPasoInscripcion: 301, tipo: 'abierto', fechaEvento: '2026-07-29T08:00:00.000Z', ip: null },
    { idEvento: 63, idPasoInscripcion: 301, tipo: 'abierto', fechaEvento: '2026-07-29T08:00:02.000Z', ip: null },
  ]);
  assert.equal(grupos.find((g) => g.idEvento === 63)!.grupoDedupId, 62);
});

test('tipos distintos no se agrupan aunque caigan en la misma ventana', () => {
  const grupos = deduplicarEventos([
    { idEvento: 70, idPasoInscripcion: 400, tipo: 'abierto', fechaEvento: '2026-07-29T08:00:00.000Z', ip: null },
    { idEvento: 71, idPasoInscripcion: 400, tipo: 'clic', fechaEvento: '2026-07-29T08:00:00.100Z', ip: null },
  ]);
  assert.equal(grupos.find((g) => g.idEvento === 71)!.esRepresentanteGrupo, true);
});

test('pasos distintos no se agrupan aunque caigan en la misma ventana', () => {
  const grupos = deduplicarEventos([
    { idEvento: 80, idPasoInscripcion: 500, tipo: 'abierto', fechaEvento: '2026-07-29T08:00:00.000Z', ip: null },
    { idEvento: 81, idPasoInscripcion: 501, tipo: 'abierto', fechaEvento: '2026-07-29T08:00:00.100Z', ip: null },
  ]);
  assert.equal(grupos.find((g) => g.idEvento === 81)!.esRepresentanteGrupo, true);
});

test('ips distintas no nulas rompen el agrupamiento aunque caigan en la ventana (dos dispositivos)', () => {
  const grupos = deduplicarEventos([
    { idEvento: 90, idPasoInscripcion: 600, tipo: 'abierto', fechaEvento: '2026-07-29T08:00:00.000Z', ip: '1.1.1.1' },
    { idEvento: 91, idPasoInscripcion: 600, tipo: 'abierto', fechaEvento: '2026-07-29T08:00:00.100Z', ip: '2.2.2.2' },
  ]);
  assert.equal(grupos.find((g) => g.idEvento === 91)!.esRepresentanteGrupo, true);
});

test('IP faltante en alguno no bloquea el desempate: solo pesan tiempo, paso y tipo', () => {
  const grupos = deduplicarEventos([
    { idEvento: 92, idPasoInscripcion: 601, tipo: 'abierto', fechaEvento: '2026-07-29T08:00:00.000Z', ip: '1.1.1.1' },
    { idEvento: 93, idPasoInscripcion: 601, tipo: 'abierto', fechaEvento: '2026-07-29T08:00:00.100Z', ip: null },
  ]);
  assert.equal(grupos.find((g) => g.idEvento === 93)!.grupoDedupId, 92);
});

test('ventana encadenada: tres eventos separados por 1500ms cada uno se agrupan aunque el ultimo este a 3000ms del primero', () => {
  const grupos = deduplicarEventos([
    { idEvento: 94, idPasoInscripcion: 700, tipo: 'abierto', fechaEvento: '2026-07-29T08:00:00.000Z', ip: null },
    { idEvento: 95, idPasoInscripcion: 700, tipo: 'abierto', fechaEvento: '2026-07-29T08:00:01.500Z', ip: null },
    { idEvento: 96, idPasoInscripcion: 700, tipo: 'abierto', fechaEvento: '2026-07-29T08:00:03.000Z', ip: null },
  ]);
  assert.equal(grupos.find((g) => g.idEvento === 96)!.grupoDedupId, 94);
  assert.equal(grupos.find((g) => g.idEvento === 96)!.esRepresentanteGrupo, false);
});

// --- Aviso de no medible ---

test('paso 115 (Gmail: solo el proxy abrio, sin clic) sale sin_senal_humana_de_apertura', () => {
  const estado = estadoMedibilidadEnvio([{ tipo: 'abierto', clasificacion: 'maquina' }]);
  assert.equal(estado, 'sin_senal_humana_de_apertura');
});

test('paso 114 (Outlook: cero aperturas, un clic humano) sale pixel_bloqueado_confirmado', () => {
  const estado = estadoMedibilidadEnvio([{ tipo: 'clic', clasificacion: 'humano' }]);
  assert.equal(estado, 'pixel_bloqueado_confirmado');
});

test('un clic desconocido tambien deduce pixel_bloqueado_confirmado', () => {
  const estado = estadoMedibilidadEnvio([{ tipo: 'clic', clasificacion: 'desconocido' }]);
  assert.equal(estado, 'pixel_bloqueado_confirmado');
});

test('apertura humana confirmada le gana a un clic aunque haya de los dos', () => {
  const estado = estadoMedibilidadEnvio([
    { tipo: 'abierto', clasificacion: 'humano' },
    { tipo: 'clic', clasificacion: 'maquina' },
  ]);
  assert.equal(estado, 'apertura_humana_confirmada');
});

test('sin eventos sale sin_senal_humana_de_apertura', () => {
  assert.equal(estadoMedibilidadEnvio([]), 'sin_senal_humana_de_apertura');
});

test('un clic de maquina (ej. escaner) no cuenta como prueba deductiva', () => {
  const estado = estadoMedibilidadEnvio([{ tipo: 'clic', clasificacion: 'maquina' }]);
  assert.equal(estado, 'sin_senal_humana_de_apertura');
});

test('un solo caso de outlook.com no alcanza el umbral (evento real, envio 114)', () => {
  const dominios = dominiosConAvisoNoMedible([{ dominio: 'outlook.com', estado: 'pixel_bloqueado_confirmado' }]);
  assert.deepEqual(dominios, []);
});

test('tres casos bloqueados y cero confirmados si alcanzan el umbral', () => {
  const dominios = dominiosConAvisoNoMedible([
    { dominio: 'outlook.com', estado: 'pixel_bloqueado_confirmado' },
    { dominio: 'outlook.com', estado: 'pixel_bloqueado_confirmado' },
    { dominio: 'outlook.com', estado: 'pixel_bloqueado_confirmado' },
  ]);
  assert.deepEqual(dominios, ['outlook.com']);
});

test('un solo envio confirmado en el dominio invalida el aviso aunque haya varios bloqueados', () => {
  const dominios = dominiosConAvisoNoMedible([
    { dominio: 'outlook.com', estado: 'pixel_bloqueado_confirmado' },
    { dominio: 'outlook.com', estado: 'pixel_bloqueado_confirmado' },
    { dominio: 'outlook.com', estado: 'pixel_bloqueado_confirmado' },
    { dominio: 'outlook.com', estado: 'apertura_humana_confirmada' },
  ]);
  assert.deepEqual(dominios, []);
});
