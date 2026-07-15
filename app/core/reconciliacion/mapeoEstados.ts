// Core puro (hexagonal): traduce el campo "Estado" de Notion al enum
// estado_notion de la DB (CHECK constraint en empresa.estado_notion). No toca
// la DB ni el adapter de Notion; T10 es quien escribe el resultado tras la
// reconciliacion. Ver planning/spec-carga-reconciliacion-notion.md (Fase 3).
export type EstadoNotion =
  | 'lead'
  | 'contacto_iniciado'
  | 'oportunidad'
  | 'reunion_agendada'
  | 'cierre_documentacion'
  | 'enviar_contrato'
  | 'on_hold'
  | 'firma_pago';

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

// Huerfanos decididos (spec): "firmado" aun no es "pago hecho", asi que ambos
// caen en cierre_documentacion en vez de firma_pago. Excepcion explicita, no
// una regla general de fuzzy-match.
const HUERFANOS: Record<string, EstadoNotion> = {
  'Contrato Firmado': 'cierre_documentacion',
  'Firma Pendiente': 'cierre_documentacion',
};

export function mapearEstadoNotion(estadoNotion: string): EstadoNotion {
  const directo = MAPA_DIRECTO[estadoNotion] ?? HUERFANOS[estadoNotion];
  if (directo) return directo;
  // Fallar temprano y claro: un estado no mapeado escrito tal cual violaria
  // el CHECK de estado_notion en la DB en T10, de forma confusa y tarde.
  throw new Error(`Estado Notion desconocido, sin mapeo a estado_notion: "${estadoNotion}"`);
}
