// El core define QUE cambia en el CRM, no COMO se escribe. Verificado contra el
// schema real del "Sales Pipeline" de Notion (2026-07-06): Notas Discovery y Proximo
// Paso son texto libre, Fecha Proximo Paso es fecha. Estado es tipo "status" (no
// texto ni select simple), fuera de alcance de este primer corte, requiere mapear
// contra los grupos de status reales de Notion antes de escribirlo con seguridad.
//
// Tarea 6: fechaPrimerContacto, fechaUltimoContacto y toquesHechos son NUEVOS, sin
// verificar en vivo contra el "Sales Pipeline" real (a diferencia de los 3 campos de
// arriba). Ver la nota en notion.ts junto a construirPropiedades antes de activarlos.
//
// write-path del MCP (2026-07-24, integraciones/propuesta-write-path.md): estado y
// razonPerdida son NUEVOS y viajan DB -> Notion por primera vez. Antes estado solo iba
// Notion -> DB (sync manual) y razonPerdida se quedaba local (ver docs/operar-data.md
// Recetas 2 y 4). El outbox ya los CARGA en el payload; su EMISION a Notion esta gateada
// por env en el adaptador (construirPropiedades) porque los nombres de propiedad/opcion de
// Notion no estan verificados en vivo y una propiedad mal armada rompe el PATCH entero de
// esa fila. Ver la nota larga en notion.ts. estado es tipo "status" en Notion (no texto),
// por eso necesita mapear el slug interno (contacto_iniciado, on_hold...) contra el nombre
// real de la opcion de status antes de escribirlo con seguridad.
export type CambioNotion = {
  notionPageId: string;
  notasDiscovery?: string;
  proximoPaso?: string;
  fechaProximoPaso?: string;
  fechaPrimerContacto?: string; // YYYY-MM-DD, se manda solo la primera vez (empresa sin toques previos)
  fechaUltimoContacto?: string; // YYYY-MM-DD, se manda en cada toque registrado
  toquesHechos?: string; // tabla en texto plano, una linea por toque (fecha, canal, resultado)
  estado?: string; // valor de empresa.estado_notion (slug interno); el adaptador lo mapea a la opcion de status de Notion
  razonPerdida?: string; // texto libre de por que se marco perdida/on_hold
};

export interface SyncAdapter {
  actualizarPagina(cambio: CambioNotion): Promise<void>;
}
