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
