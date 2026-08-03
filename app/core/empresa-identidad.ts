// Core puro de la IDENTIDAD de una cuenta: como se genera su id, que valores acepta y
// como se normaliza un identificador (telefono, dominio) para cruzarlo. No toca la DB ni
// ningun adaptador. Lo consumen crearEmpresa/buscarEmpresa/actualizarEmpresa
// (app/db/repository.ts) y, por ahi, las tools del MCP.
//
// Existe porque el criterio de "que id le toca a una cuenta nueva" estaba SOLO en un script
// de seed en Python (scripts/seed_apply.py del worktree de outbox, funcion eid()) y en las
// 97 filas que ese script dejo en isps.db. Sin este archivo, cualquier caller nuevo lo
// deduce mal y fabrica un id que no cruza con nada.
import { createHash } from 'node:crypto';
// Imports sin extension: este modulo entra al bundle de Next por repository.ts, y ese arbol
// se resuelve con moduleResolution "bundler". El loader de los tests/scripts
// (scripts/resolve-ts-ext.mjs) resuelve las dos formas.
import { normalizarRazonSocial } from './reconciliacion/normalizarRazonSocial';
import type { EstadoNotion } from './reconciliacion/mapeoEstados';

// Categorias reales de empresa.categoria en isps.db (medido 2026-07-24 sobre 1.956 filas:
// isp 1.867, utility 64, otro 18, NULL 7). No hay CHECK en la columna, asi que la lista la
// tiene que imponer el dominio: sin esto, una cuarta categoria inventada rompe en silencio
// el filtro de alcance del brain (solo ISP) en vez de fallar al escribir.
export const CATEGORIAS_EMPRESA = ['isp', 'utility', 'otro'] as const;
export type CategoriaEmpresa = (typeof CATEGORIAS_EMPRESA)[number];

// 'test' NO es una categoria de negocio y por eso vive aparte de las tres de arriba: es la
// marca de una cuenta sembrada para probar el flujo. Existe porque la vista empresa_categoria
// de pruebas.db tiene una rama que solo dispara con este valor (scripts/seed_pruebas.ts), y esa
// vista es la columna por la que el wizard de campanas segmenta (COLUMNA_SEGMENTO en
// repository.ts). Sin poder escribirlo desde la web, una cuenta creada a mano en modo prueba
// nunca cae en el segmento de prueba y la campana sale vacia.
//
// Separado a proposito: el alcance del brain (solo ISP) y cualquier conteo por categoria
// siguen leyendo CATEGORIAS_EMPRESA, que no cambia de tamaño.
export const CATEGORIA_PRUEBA = 'test';
export const CATEGORIAS_ESCRIBIBLES = [...CATEGORIAS_EMPRESA, CATEGORIA_PRUEBA] as const;
export type CategoriaEscribible = (typeof CATEGORIAS_ESCRIBIBLES)[number];

// Con que categoria nace una cuenta creada desde la web. En modo prueba es 'test' para que
// caiga sola en el segmento de prueba; fuera de el, la categoria dominante de la base (isp:
// 1.867 de 1.956 filas).
export function categoriaPorDefecto(modoPrueba: boolean): CategoriaEscribible {
  return modoPrueba ? CATEGORIA_PRUEBA : 'isp';
}

// El gate de 'test' vive aca (core puro) y lo aplica la action, NO el repository: el
// repository no tiene un solo if de modo prueba y ese diseño es lo que hace imposible que una
// escritura se equivoque de base (ver app/db/index.ts). Una cuenta 'test' en isps.db no
// rompería nada -- la columna no tiene CHECK y el alcance ISP la dejaria fuera -- pero seria
// basura en la base real, asi que se rechaza en la puerta.
export function categoriaAceptada(categoria: string, modoPrueba: boolean): categoria is CategoriaEscribible {
  if (categoria === CATEGORIA_PRUEBA) return modoPrueba;
  return (CATEGORIAS_EMPRESA as readonly string[]).includes(categoria);
}

// Prefijo de los ids sinteticos: cuentas que nacieron de una pagina de Notion y no tienen
// NIT. 97 filas en isps.db hoy.
const PREFIJO_SINTETICO = 'ntn-';
const LARGO_SUFIJO_SINTETICO = 12;

// Id sintetico de una cuenta sin NIT. La convencion NO se dedujo: se leyo de la base y se
// verifico contra las 97 filas `ntn-` reales (2026-07-24). 96 de 97 salen exactamente de
// md5(normalizarRazonSocial(nombre_oficial)) truncado a 12 hex, que es lo que hace eid() en
// scripts/seed_apply.py, el script que las creo.
//
// La fila 97 (Conexa Tech Colombia SAS, creada a mano el 2026-07-22) usa otra cosa -- los
// ultimos 12 hex de su notion_page_id -- y es justamente el duplicado vivo que motivo esta
// funcion. Una excepcion de una fila no es la convencion; se sigue la de las 96.
//
// Determinista a proposito (mismo nombre -> mismo id): dos intentos de crear la misma cuenta
// chocan contra la PK en vez de dejar dos filas distintas. Es la segunda red, debajo de la
// salvaguarda de duplicados de crearEmpresa.
export function idEmpresaSintetico(nombreOficial: string): string {
  const raiz = normalizarRazonSocial(nombreOficial);
  const hash = createHash('md5').update(raiz).digest('hex').slice(0, LARGO_SUFIJO_SINTETICO);
  return `${PREFIJO_SINTETICO}${hash}`;
}

// empresa.estado_comercial es NOT NULL con CHECK propio ('cliente','negociacion',
// 'contactado','pausado','lead','descartado'), separado del CHECK de estado_notion. Una
// cuenta nueva tiene que traer los dos, y el caller (Notion, el brain) solo conoce la etapa
// del embudo. Este mapa es la moda REAL de isps.db, contada por par estado_notion x
// estado_comercial el 2026-07-24, no una traduccion inventada:
//   lead -> lead (190 de 212)            contacto_iniciado -> contactado (35 de 40)
//   reunion_agendada -> contactado (2/2) oportunidad -> negociacion (22 de 23)
//   cierre_documentacion -> negociacion (9 de 13)
//   enviar_contrato -> negociacion (2/2) firma_pago -> cliente (101 de 102)
//   on_hold -> pausado (132 de 136)
// La dispersion restante son filas movidas a mano en Notion sin tocar estado_comercial; se
// escribe la moda, no se replica el ruido.
export const ESTADO_COMERCIAL_POR_ETAPA: Record<EstadoNotion, string> = {
  lead: 'lead',
  contacto_iniciado: 'contactado',
  reunion_agendada: 'contactado',
  oportunidad: 'negociacion',
  cierre_documentacion: 'negociacion',
  enviar_contrato: 'negociacion',
  firma_pago: 'cliente',
  on_hold: 'pausado',
};

// Un NIT colombiano sin digito de verificacion. En isps.db los 1.740 ids de tipo 'nit' son
// todos numericos, 1.738 de 9 digitos y 2 de 8. Se acepta 8..10 (el 10 deja pasar un NIT con
// DV pegado, que es un error de captura visible, no una fila silenciosa con id raro).
const NIT_VALIDO = /^\d{8,10}$/;

export function esNitValido(nit: string): boolean {
  return NIT_VALIDO.test(nit.trim());
}

// Los ids sinteticos son de dos formas, las dos vivas en isps.db: el prefijo 'ntn-' que pone
// crearEmpresa/seed_apply.py, y el rango 999xxxxxxx que uso una carga anterior (9990000019
// Vivercom, 9990000157 LATITUDE-SH, 9990000164 S3WIRELESS).
//
// Para que serve saberlo: un id sintetico es provisional, se puso porque no habia NIT a la
// mano. Un NIT real es definitivo. reasignarNit() solo acepta ir de provisional a definitivo,
// nunca al reves ni entre dos NITs, y esta funcion es el guard de esa direccion.
const RANGO_SINTETICO_999 = /^999\d{7}$/;

export function esIdSintetico(idEmpresa: string): boolean {
  const id = idEmpresa.trim();
  return id.startsWith(PREFIJO_SINTETICO) || RANGO_SINTETICO_999.test(id);
}

// Los 10 digitos de un telefono colombiano, sin indicativo ni signos: es la forma con la que
// se cruza contra contacto.telefono y prospeccion.telefonos_raw, que guardan las dos formas
// ('+573184634523' y '3184634523' conviven hoy en contacto para la MISMA persona). Se toman
// los ultimos 10 digitos; un fijo corto (8 digitos, tambien real en la base) se queda con los
// que tenga y sigue cruzando por igualdad exacta contra otro fijo igual.
export function telefonoNormalizado(telefono: string): string {
  const digitos = telefono.replace(/\D+/g, '');
  return digitos.length > 10 ? digitos.slice(-10) : digitos;
}

// Dominio desnudo de una URL, un email o un dominio pelado. Sirve para cruzar
// prospeccion.website contra contacto.email y contra lo que traiga el caller.
// Sin protocolo, sin www., sin ruta, sin puerto, en minusculas.
export function dominioDe(valor: string): string {
  const limpio = valor.trim().toLowerCase();
  if (limpio === '') return '';
  const despuesDeArroba = limpio.includes('@') ? limpio.slice(limpio.lastIndexOf('@') + 1) : limpio;
  const sinProtocolo = despuesDeArroba.replace(/^[a-z0-9+.-]+:\/\//, '');
  const sinRuta = sinProtocolo.split('/')[0].split('?')[0].split('#')[0];
  const sinPuerto = sinRuta.split(':')[0];
  return sinPuerto.replace(/^www\./, '');
}
