// Integracion: clasificacion + dedup + medibilidad en trackingCorreoTool (2026-07-29).
//
// Cubre el encargo completo sobre la tool tracking_correo:
//   1. El bug de lectura (repository.ts antes leia user_agent/userAgent, el productor real
//      escribe 'ua') queda arreglado -- se siembra la clave real y se verifica que userAgent
//      no sale null.
//   2. clasificarEvento (core/clasificar-evento-tracking.ts) corre sobre cada fila: humano,
//      maquina, desconocido, con su razon y su confianza, en el orden de precedencia real.
//   3. agruparDuplicados (core/dedup-eventos-tracking.ts) agrupa sin borrar: el caso canonico
//      de produccion (dos hits a 5ms se funden, uno a 2m22s no) se reproduce acá contra una
//      conexion better-sqlite3 aparte.
//   4. estadoMedibilidadEnvio + dominiosConAvisoNoMedible: apertura_humana_confirmada,
//      pixel_bloqueado_confirmado (deductivo, un solo caso alcanza) y sin_senal_humana_de_apertura
//      (nunca se lee como "no lo abrio"), mas el umbral de 3 casos para el aviso a nivel dominio.
//
// Sembrado por debajo de repository.ts (crearCadencia/guardarSegmento/crearCampana/
// inscribirCampana/crearPasoInscripcionPendiente/marcarPasoInscripcionEnviada), igual que
// repository.tracking.test.ts -- es mas directo que pasar por las tools de escritura y da
// control exacto sobre fechaEnviada, que es lo que necesita R3 (latencia). Los eventos de
// tracking se insertan con una conexion better-sqlite3 ABIERTA APARTE (Database(dbPath), no el
// valor de retorno de una funcion), como pide el runbook del proyecto.
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { crearDbPrueba } from '../db/test-helpers.ts';

const dbPath = crearDbPrueba();
process.env.ISPS_DB_PATH = dbPath;

const {
  crearCadencia,
  guardarSegmento,
  crearCampana,
  inscribirCampana,
  historialInscripciones,
  destinatariosDeInscripcion,
  crearPasoInscripcionPendiente,
  marcarPasoInscripcionEnviada,
} = await import('../db/repository.ts');
const { trackingCorreoTool } = await import('./tools.ts');

function raw() {
  return new Database(dbPath);
}

// --- seed: 8 empresas bajo UN segmento, UNA cadencia de un paso de correo ----------------
//
// Cada empresa es un "envio" (paso_inscripcion) distinto, como en produccion campana 58: un
// destinatario, un paso, un evento_tracking por lo que le paso a ese correo puntual.
const CIUDADES = [
  'trk-iphone',
  'trk-mac',
  'trk-proxy',
  'trk-viejo',
  'trk-outlook-1',
  'trk-outlook-2',
  'trk-outlook-3',
  'trk-outlook-unico',
  'trk-dedup',
  'trk-prueba-interna',
  'trk-mpp',
  'trk-latencia',
];

for (const ciudad of CIUDADES) {
  const db = raw();
  db.prepare(
    `INSERT INTO empresa (id_empresa, tipo_id, nombre_oficial, nombre_normalizado, estado_comercial, estado_notion, ciudad_principal)
     VALUES (?, 'nit', ?, ?, 'activo', 'on_hold', ?)`,
  ).run(ciudad, ciudad, ciudad, ciudad);
  db.close();
}

function emailDe(ciudad: string, dominio: string) {
  return `contacto-${ciudad}@${dominio}`;
}

const DOMINIOS: Record<string, string> = {
  'trk-iphone': 'iphone-real.com',
  'trk-mac': 'mac-real.com',
  'trk-proxy': 'gmail-proxy-only.com',
  'trk-viejo': 'viejo-sin-huella.com',
  'trk-outlook-1': 'outlook.com',
  'trk-outlook-2': 'outlook.com',
  'trk-outlook-3': 'outlook.com',
  'trk-outlook-unico': 'otro-proveedor-bloqueado.com',
  'trk-dedup': 'dedup-real.com',
  'trk-prueba-interna': 'verificacion-agente.com',
  'trk-mpp': 'apple-mpp-candidate.com',
  'trk-latencia': 'latencia-bot.com',
};

for (const ciudad of CIUDADES) {
  const db = raw();
  db.prepare(
    `INSERT INTO contacto (id_empresa, nombre, es_key_decision_maker, es_principal, telefono, email, fuente)
     VALUES (?, 'Contacto', 1, 1, '3000000000', ?, 'seed')`,
  ).run(ciudad, emailDe(ciudad, DOMINIOS[ciudad]));
  db.close();
}

const idCadencia = crearCadencia({ nombre: 'C tracking', pasos: [{ orden: 1, diaOffset: 0, canal: 'correo', asunto: 'Asunto', cuerpo: 'Cuerpo' }] });
const idSegmento = guardarSegmento({ nombre: 'seg-tracking', definicion: { condiciones: [{ campo: 'ciudad', op: 'en', valores: CIUDADES }] } }, 1);
const idCampana = crearCampana({ nombre: 'Camp tracking', idCadencia, idSegmento }, 1);
inscribirCampana(idCampana, 1);

function idPasoDeCiudad(idPaso: number, idVersion: number, ciudad: string, fechaEnviada: string): number {
  const idInscripcion = historialInscripciones(ciudad).find((i) => i.estado === 'activa')!.id;
  const idDestinatario = destinatariosDeInscripcion(idInscripcion)[0].id;
  const idPasoInscripcion = crearPasoInscripcionPendiente({ idDestinatario, idPaso, idVersion, canal: 'correo' });
  marcarPasoInscripcionEnviada(idPasoInscripcion, 'apollo', `apollo-${ciudad}`, fechaEnviada);
  return idPasoInscripcion;
}

function idsPasoYVersion(idCad: number) {
  const db = raw();
  const paso = db.prepare('SELECT id_paso FROM paso_cadencia WHERE id_cadencia = ?').get(idCad) as { id_paso: number };
  const version = db.prepare('SELECT id_version FROM version_paso WHERE id_paso = ?').get(paso.id_paso) as { id_version: number };
  db.close();
  return { idPaso: paso.id_paso, idVersion: version.id_version };
}
const { idPaso, idVersion } = idsPasoYVersion(idCadencia);

const FECHA_ENVIO = '2026-07-28T09:00:00.000Z';

const pasoIphone = idPasoDeCiudad(idPaso, idVersion, 'trk-iphone', FECHA_ENVIO);
const pasoMac = idPasoDeCiudad(idPaso, idVersion, 'trk-mac', FECHA_ENVIO);
const pasoProxy = idPasoDeCiudad(idPaso, idVersion, 'trk-proxy', FECHA_ENVIO);
// Envio verdaderamente viejo: su propio fechaEnviada tiene que ser ANTERIOR a su fecha_evento
// (2026-07-01), o R3 (latencia bajo el piso fisico) dispara con un delta negativo y esconde el
// caso que este envio quiere probar (R6, sin_huella_capturada).
const pasoViejo = idPasoDeCiudad(idPaso, idVersion, 'trk-viejo', '2026-06-28T09:00:00.000Z');
const pasoOutlook1 = idPasoDeCiudad(idPaso, idVersion, 'trk-outlook-1', FECHA_ENVIO);
const pasoOutlook2 = idPasoDeCiudad(idPaso, idVersion, 'trk-outlook-2', FECHA_ENVIO);
const pasoOutlook3 = idPasoDeCiudad(idPaso, idVersion, 'trk-outlook-3', FECHA_ENVIO);
const pasoOutlookUnico = idPasoDeCiudad(idPaso, idVersion, 'trk-outlook-unico', FECHA_ENVIO);
const pasoDedup = idPasoDeCiudad(idPaso, idVersion, 'trk-dedup', FECHA_ENVIO);
const pasoPruebaInterna = idPasoDeCiudad(idPaso, idVersion, 'trk-prueba-interna', FECHA_ENVIO);
const pasoMpp = idPasoDeCiudad(idPaso, idVersion, 'trk-mpp', FECHA_ENVIO);
const pasoLatencia = idPasoDeCiudad(idPaso, idVersion, 'trk-latencia', FECHA_ENVIO);

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UA_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const UA_GMAIL_PROXY = 'Mozilla/5.0 (via GoogleImageProxy)';

// --- eventos, via una conexion better-sqlite3 ABIERTA APARTE -----------------------------
{
  const db = raw();
  const ins = db.prepare(
    `INSERT INTO evento_tracking (id_paso_inscripcion, tipo, canal, proveedor_evento_id, detalle, fecha_evento, created_at)
     VALUES (?, ?, 'correo', ?, ?, ?, ?)`,
  );

  // Evento 14/15 real: UA de navegador completo -> humano, ua_navegador_completo. Confirma el
  // bug 1: la clave que escribe huella-request.ts es 'ua', y con eso userAgent NO sale null.
  ins.run(pasoIphone, 'abierto', 'ev-iphone', JSON.stringify({ via: 'pixel', ua: UA_IPHONE, ip: '190.10.1.1' }), '2026-07-28T09:05:00.000Z', '2026-07-28T09:05:00.000Z');
  ins.run(pasoMac, 'abierto', 'ev-mac', JSON.stringify({ via: 'pixel', ua: UA_MAC, ip: '190.10.1.2' }), '2026-07-28T09:06:00.000Z', '2026-07-28T09:06:00.000Z');

  // Evento 13 real: proxy de imagenes de Gmail, solo hit del pixel -> maquina, sin clic. El
  // envio nunca tiene apertura humana ni clic -> sin_senal_humana_de_apertura (cubre Gmail).
  ins.run(pasoProxy, 'abierto', 'ev-proxy', JSON.stringify({ via: 'pixel', ua: UA_GMAIL_PROXY, ip: '66.249.1.1' }), '2026-07-28T09:05:30.000Z', '2026-07-28T09:05:30.000Z');

  // Eventos 6-10 reales: sin huella porque la captura no existia antes del 2026-07-28 ->
  // desconocido, sin_huella_capturada. Sin clic tampoco -> sin_senal_humana_de_apertura
  // (cubre Outlook: mismo estado final, causa distinta, y por eso NUNCA se lee "no lo abrio").
  ins.run(pasoViejo, 'abierto', 'ev-viejo', JSON.stringify({ via: 'pixel' }), '2026-07-01T09:05:00.000Z', '2026-07-01T09:05:00.000Z');

  // Evento 15 real (paso 114): un CLIC sin apertura previa es prueba deductiva de que el pixel
  // fallo -- pixel_bloqueado_confirmado, sin necesitar muestra. Tres envios en outlook.com con
  // este mismo patron y CERO confirmados alcanzan el umbral (3) del aviso a nivel proveedor.
  ins.run(pasoOutlook1, 'clic', 'ev-outlook-1', JSON.stringify({ via: 'link', url: 'https://onepay.co/a', ua: UA_MAC, ip: '20.1.1.1' }), '2026-07-28T10:00:00.000Z', '2026-07-28T10:00:00.000Z');
  ins.run(pasoOutlook2, 'clic', 'ev-outlook-2', JSON.stringify({ via: 'link', url: 'https://onepay.co/b', ua: UA_MAC, ip: '20.1.1.2' }), '2026-07-28T10:01:00.000Z', '2026-07-28T10:01:00.000Z');
  ins.run(pasoOutlook3, 'clic', 'ev-outlook-3', JSON.stringify({ via: 'link', url: 'https://onepay.co/c', ua: UA_MAC, ip: '20.1.1.3' }), '2026-07-28T10:02:00.000Z', '2026-07-28T10:02:00.000Z');
  // Un cuarto caso en OTRO dominio: un solo bloqueado no alcanza el umbral de 3, asi que este
  // dominio NO debe aparecer en avisosProveedor (asi esta medido hoy con outlook.com real: un
  // solo caso, el sistema reporta el envio puntual, no una regla general sobre el proveedor).
  ins.run(pasoOutlookUnico, 'clic', 'ev-outlook-unico', JSON.stringify({ via: 'link', url: 'https://onepay.co/d', ua: UA_MAC, ip: '20.2.1.1' }), '2026-07-28T10:03:00.000Z', '2026-07-28T10:03:00.000Z');

  // Caso canonico de dedup (eventos 6, 8, 9 reales del paso 113): e6 2m22s antes queda
  // separado; e8/e9 a 5ms se funden en un solo grupo con representante e8.
  ins.run(pasoDedup, 'abierto', 'ev-dedup-6', JSON.stringify({ via: 'pixel', ua: UA_IPHONE, ip: '30.1.1.1' }), '2026-07-27T08:00:00.000Z', '2026-07-27T08:00:00.000Z');
  ins.run(pasoDedup, 'abierto', 'ev-dedup-8', JSON.stringify({ via: 'pixel', ua: UA_IPHONE, ip: '30.1.1.1' }), '2026-07-27T08:02:22.000Z', '2026-07-27T08:02:22.000Z');
  ins.run(pasoDedup, 'abierto', 'ev-dedup-9', JSON.stringify({ via: 'pixel', ua: UA_IPHONE, ip: '30.1.1.1' }), '2026-07-27T08:02:22.005Z', '2026-07-27T08:02:22.005Z');

  // R1: trafico de prueba interno (eventos 11-12 reales). excluir_de_metricas tiene que sacarlo
  // de conteos.crudo/deduplicado.porClasificacion.
  ins.run(pasoPruebaInterna, 'abierto', 'ev-prueba', JSON.stringify({ via: 'pixel', ua: 'VERIFICACION-AGENTE/1.0', ip: '10.0.0.1' }), '2026-07-28T09:10:00.000Z', '2026-07-28T09:10:00.000Z');

  // R4: Mozilla/5.0 pelado, candidato a Apple MPP. Confianza media, no alta.
  ins.run(pasoMpp, 'abierto', 'ev-mpp', JSON.stringify({ via: 'pixel', ua: 'Mozilla/5.0', ip: '40.1.1.1' }), '2026-07-28T09:15:00.000Z', '2026-07-28T09:15:00.000Z');

  // R3: latencia bajo el piso fisico. 300ms despues del envio, con un UA que de otro modo
  // pasaria por navegador completo -- R3 corre ANTES que R7, asi que gana la maquina.
  ins.run(pasoLatencia, 'abierto', 'ev-latencia', JSON.stringify({ via: 'pixel', ua: UA_MAC, ip: '50.1.1.1' }), '2026-07-28T09:00:00.300Z', '2026-07-28T09:00:00.300Z');

  db.close();
}

const r = trackingCorreoTool({ idCampana }, 1);

test('bug 1 arreglado: userAgent sale poblado desde detalle.ua, conHuella ya no es 0', () => {
  const iphone = r.eventos.find((e) => e.proveedorEventoId === 'ev-iphone')!;
  assert.equal(iphone.userAgent, UA_IPHONE, 'la clave real es ua, no user_agent/userAgent');
  assert.ok(r.conHuella > 0, 'con el bug viejo esto era 0 aunque los eventos trajeran ua en el detalle');
});

test('clasificarEvento: UA de navegador completo real -> humano', () => {
  const iphone = r.eventos.find((e) => e.proveedorEventoId === 'ev-iphone')!;
  const mac = r.eventos.find((e) => e.proveedorEventoId === 'ev-mac')!;
  assert.equal(iphone.clasificacion, 'humano');
  assert.equal(iphone.razon, 'ua_navegador_completo');
  assert.equal(iphone.confianza, 'media');
  assert.equal(mac.clasificacion, 'humano');
});

test('clasificarEvento: proxy de imagenes de Gmail -> maquina, no cuenta como apertura humana', () => {
  const proxy = r.eventos.find((e) => e.proveedorEventoId === 'ev-proxy')!;
  assert.equal(proxy.clasificacion, 'maquina');
  assert.equal(proxy.razon, 'proxy_imagenes_gmail');
  assert.equal(proxy.confianza, 'alta');
});

test('clasificarEvento: sin ua capturado -> desconocido, sin_huella_capturada (no es inferencia, es la ausencia del dato)', () => {
  const viejo = r.eventos.find((e) => e.proveedorEventoId === 'ev-viejo')!;
  assert.equal(viejo.clasificacion, 'desconocido');
  assert.equal(viejo.razon, 'sin_huella_capturada');
  assert.equal(viejo.userAgent, null);
});

test('clasificarEvento: trafico de prueba interno -> maquina, excluido de metricas', () => {
  const prueba = r.eventos.find((e) => e.proveedorEventoId === 'ev-prueba')!;
  assert.equal(prueba.clasificacion, 'maquina');
  assert.equal(prueba.razon, 'trafico_prueba_interno');
  assert.equal(prueba.excluirDeMetricas, true);
  assert.ok(!r.conteos.crudo.porClasificacion || r.conteos.crudo.porClasificacion.maquina < r.conteos.crudo.total, 'no se mezcla con datos reales');
});

test('clasificarEvento: Mozilla/5.0 pelado -> maquina con confianza media, candidato a Apple MPP', () => {
  const mpp = r.eventos.find((e) => e.proveedorEventoId === 'ev-mpp')!;
  assert.equal(mpp.clasificacion, 'maquina');
  assert.equal(mpp.razon, 'candidato_proxy_apple_mpp');
  assert.equal(mpp.confianza, 'media');
});

test('clasificarEvento: R3 (latencia bajo el piso fisico) gana aunque el UA sea de navegador completo', () => {
  const latencia = r.eventos.find((e) => e.proveedorEventoId === 'ev-latencia')!;
  assert.equal(latencia.clasificacion, 'maquina');
  assert.equal(latencia.razon, 'latencia_bajo_piso_fisico');
  assert.equal(latencia.senal, 'latencia_ms:300');
});

test('dedup: dos hits a 5ms se funden en un grupo, el de 2m22s antes queda separado (caso canonico de produccion)', () => {
  const e6 = r.eventos.find((e) => e.proveedorEventoId === 'ev-dedup-6')!;
  const e8 = r.eventos.find((e) => e.proveedorEventoId === 'ev-dedup-8')!;
  const e9 = r.eventos.find((e) => e.proveedorEventoId === 'ev-dedup-9')!;

  assert.equal(e6.esRepresentanteGrupo, true);
  assert.equal(e6.grupoDedupId, e6.idEvento, 'sin duplicados, es su propio representante');

  assert.equal(e8.esRepresentanteGrupo, true, 'el mas temprano del grupo es el representante');
  assert.equal(e9.esRepresentanteGrupo, false);
  assert.equal(e9.grupoDedupId, e8.idEvento);
  assert.notEqual(e6.grupoDedupId, e8.grupoDedupId, 'a 2m22s de distancia, fuera de la ventana de 2000ms, es otra apertura');

  // Verificado tambien releyendo por fuera de la funcion, contra la conexion better-sqlite3
  // aparte: las TRES filas siguen en la base -- dedup agrupa, nunca borra.
  const db = raw();
  const total = db.prepare('SELECT count(*) c FROM evento_tracking WHERE id_paso_inscripcion = ?').get(pasoDedup) as { c: number };
  db.close();
  assert.equal(total.c, 3);
});

test('conteos: crudo vs deduplicado distinguen filas de grupos, y humano vs maquina', () => {
  const soloDedup = r.eventos.filter((e) => e.idPasoInscripcion === pasoDedup);
  assert.equal(soloDedup.length, 3, 'crudo: las 3 filas del envio de dedup estan');
  const gruposDedup = new Set(soloDedup.map((e) => e.grupoDedupId));
  assert.equal(gruposDedup.size, 2, 'deduplicado: solo 2 aperturas reales para ese envio');

  assert.equal(r.conteos.crudo.total, r.eventos.length);
  assert.ok(r.conteos.deduplicado.total < r.conteos.crudo.total, 'el grupo de 5ms colapsa el conteo deduplicado por debajo del crudo');
  assert.ok(r.conteos.crudo.porClasificacion.humano > 0);
  assert.ok(r.conteos.crudo.porClasificacion.maquina > 0);
  assert.ok(r.conteos.deduplicado.porClasificacion.humano > 0);
});

test('medibilidad: apertura humana confirmada cuando hay un abierto humano', () => {
  const m = r.medibilidad.porEnvio.find((e) => e.idPasoInscripcion === pasoIphone)!;
  assert.equal(m.estado, 'apertura_humana_confirmada');
});

test('medibilidad: clic sin apertura previa es prueba deductiva de pixel bloqueado (evento 15 real, paso 114)', () => {
  const m = r.medibilidad.porEnvio.find((e) => e.idPasoInscripcion === pasoOutlook1)!;
  assert.equal(m.estado, 'pixel_bloqueado_confirmado');
});

test('medibilidad: sin apertura humana y sin clic -> sin_senal_humana_de_apertura, NUNCA "no lo abrio" (cubre Gmail proxy y Outlook sin huella)', () => {
  const proxy = r.medibilidad.porEnvio.find((e) => e.idPasoInscripcion === pasoProxy)!;
  const viejo = r.medibilidad.porEnvio.find((e) => e.idPasoInscripcion === pasoViejo)!;
  assert.equal(proxy.estado, 'sin_senal_humana_de_apertura');
  assert.equal(viejo.estado, 'sin_senal_humana_de_apertura');
});

test('medibilidad: envio sin ninguna fila en evento_tracking no aparece (no hay fila que leer)', () => {
  // trk-outlook no tiene una novena empresa sin eventos en este seed porque trackingCorreo
  // solo puede hablar de lo que SI tiene una fila -- lo declara la advertencia, no lo esconde.
  assert.ok(r.advertencias.some((a) => a.includes('AL MENOS UNA fila') || a.includes('no aparece')));
});

test('aviso de proveedor: 3+ envios bloqueados y cero confirmados en el mismo dominio SI dispara el aviso', () => {
  assert.ok(r.medibilidad.avisosProveedor.includes('outlook.com'));
});

test('aviso de proveedor: un solo caso bloqueado en otro dominio NO alcanza el umbral (asi esta medido hoy con outlook.com real)', () => {
  assert.ok(!r.medibilidad.avisosProveedor.includes('otro-proveedor-bloqueado.com'));
});

test('no hay ninguna tasa de apertura en la respuesta: ni un campo con %, ni "tasa", ni "openRate"', () => {
  const json = JSON.stringify(r);
  assert.ok(!/tasaApertura|openRate|"\d+(\.\d+)?%"/i.test(json));
});

test('el crudo sigue completo: cada evento trae su detalle original sin editar', () => {
  const iphone = r.eventos.find((e) => e.proveedorEventoId === 'ev-iphone')!;
  const detalle = JSON.parse(iphone.detalle!);
  assert.equal(detalle.ua, UA_IPHONE);
  assert.equal(detalle.ip, '190.10.1.1');
});
