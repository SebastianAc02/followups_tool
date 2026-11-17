// Core puro (hexagonal): traduce el campo "Estado" de Notion al enum
// estado_notion de la DB (CHECK constraint en empresa.estado_notion). No toca
// la DB ni el adapter de Notion; T10 es quien escribe el resultado tras la
// reconciliacion. Ver planning/spec-carga-reconciliacion-notion.md (Fase 3).
// Los 8 valores que acepta el CHECK de empresa.estado_notion, como lista en RUNTIME y no
// solo como tipo: cualquier caller que reciba una etapa de afuera (el MCP, un script) tiene
// que poder validarla antes de escribir, y un union de tipos se borra al compilar. El tipo
// se deriva de la lista para que no puedan divergir.
//
// El orden es el del CHECK en isps.db, no el del embudo (ese vive en FUNNEL_ETAPAS,
// app/db/funnel.ts, y a proposito deja on_hold afuera).
export const ESTADOS_NOTION = [
  'lead',
  'contacto_iniciado',
  'oportunidad',
  'reunion_agendada',
  'cierre_documentacion',
  'enviar_contrato',
  'on_hold',
  'firma_pago',
] as const;

export type EstadoNotion = (typeof ESTADOS_NOTION)[number];

// Uno-a-uno por nombre. "Reunión Agendada" no aparece en el export vivo de
// Notion hoy (el enum de la DB le sobrevive de una version anterior del
// pipeline), pero se deja mapeado por si vuelve a aparecer; no hay razon
// para tratarla distinto del resto.
const MAPA_DIRECTO: Record<string, EstadoNotion> = {
  Lead: 'lead',
  'Contacto Iniciado': 'contacto_iniciado',
  Oportunidad: 'oportunidad',
  'Reunión Agendada': 'reunion_agendada',
  'Cierre/Documentación': 'cierre_documentacion',
  'Enviar Contrato': 'enviar_contrato',
  'On Hold': 'on_hold',
  'Firma y Pago Realizado': 'firma_pago',
};

// Huerfanos decididos: los dos caen en enviar_contrato, que engloba las dos etapas de
// cierre de Notion (la del contrato y la de la firma). Asi Notion suma 2 en esa etapa y
// la base tambien. Sigue valiendo que "firmado" no es "pago hecho": ninguno cae en
// firma_pago. Excepcion explicita, no una regla general de fuzzy-match.
//
// Apuntar a un estado que el CHECK de empresa.estado_notion YA acepta es lo que evita el
// cambio de esquema: ampliar ese CHECK de 8 a 10 valores obliga en SQLite a recrear
// `empresa` con sus 1.956 filas, 8 indices, su trigger y 3 vistas, y revienta dentro de la
// transaccion de Drizzle. Por eso drizzle/manual/0011_estado_notion_check.sql queda
// cancelado: no se corre ni entra al journal.
const HUERFANOS: Record<string, EstadoNotion> = {
  'Contrato Firmado': 'enviar_contrato',
  'Firma Pendiente': 'enviar_contrato',
};

export function mapearEstadoNotion(estadoNotion: string): EstadoNotion {
  const directo = MAPA_DIRECTO[estadoNotion] ?? HUERFANOS[estadoNotion];
  if (directo) return directo;
  // Fallar temprano y claro: un estado no mapeado escrito tal cual violaria
  // el CHECK de estado_notion en la DB en T10, de forma confusa y tarde.
  throw new Error(`Estado Notion desconocido, sin mapeo a estado_notion: "${estadoNotion}"`);
}

// --- Espejo de la ficha (empresa.estado_ficha_notion, migracion 0032) ------------------
//
// Los diez slugs del espejo. A diferencia de ESTADOS_NOTION (la etapa interna, ocho valores por
// el CHECK viejo), aca entran firma_pendiente y contrato_firmado tal cual: el espejo copia lo que
// dice Notion y no colapsa nada. Copia exacta del CHECK de la 0032.
export const ESTADOS_FICHA_NOTION = [
  'lead',
  'on_hold',
  'contacto_iniciado',
  'reunion_agendada',
  'oportunidad',
  'cierre_documentacion',
  'enviar_contrato',
  'firma_pendiente',
  'contrato_firmado',
  'firma_pago',
] as const;

export type EstadoFichaNotion = (typeof ESTADOS_FICHA_NOTION)[number];

// Sin tildes, minusculas, guion bajo y barra como espacio: "Cierre/Documentación",
// "cierre documentacion" y "cierre_documentacion" son la misma etiqueta. El slug ya escrito
// tambien se acepta, porque es lo que devuelve `cuentas` y alguien lo va a pasar de vuelta.
function claveEtiqueta(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_/\s]+/g, ' ')
    .trim();
}

const ETIQUETAS_FICHA: Record<string, EstadoFichaNotion> = {
  Lead: 'lead',
  'On Hold': 'on_hold',
  'Contacto Iniciado': 'contacto_iniciado',
  'Reunión Agendada': 'reunion_agendada',
  Oportunidad: 'oportunidad',
  'Cierre/Documentación': 'cierre_documentacion',
  'Enviar Contrato': 'enviar_contrato',
  'Firma Pendiente': 'firma_pendiente',
  'Contrato Firmado': 'contrato_firmado',
  'Firma y Pago Realizado': 'firma_pago',
};

const FICHA_POR_CLAVE = new Map<string, EstadoFichaNotion>([
  ...Object.entries(ETIQUETAS_FICHA).map(([etiqueta, slug]) => [claveEtiqueta(etiqueta), slug] as [string, EstadoFichaNotion]),
  ...ESTADOS_FICHA_NOTION.map((slug) => [claveEtiqueta(slug), slug] as [string, EstadoFichaNotion]),
]);

// null y no excepcion: el caller (reconciliar_notion en modo notion) manda la pagina a sinMapeo
// y sigue con el resto del lote.
export function mapearEstadoFichaNotion(etiqueta: string): EstadoFichaNotion | null {
  return FICHA_POR_CLAVE.get(claveEtiqueta(etiqueta)) ?? null;
}
