// El core define QUE cambia en el CRM, no COMO se escribe. Verificado contra el
// schema real del "Sales Pipeline" de Notion (2026-07-06): Notas Discovery y Proximo
// Paso son texto libre, Fecha Proximo Paso es fecha. Estado es tipo "status" (no
// texto ni select simple), fuera de alcance de este primer corte, requiere mapear
// contra los grupos de status reales de Notion antes de escribirlo con seguridad.
//
// Tarea 6: fechaPrimerContacto, fechaUltimoContacto y toquesHechos son NUEVOS, sin
// verificar en vivo contra el "Sales Pipeline" real (a diferencia de los 3 campos de
// arriba). Ver la nota en notion.ts junto a construirPropiedades antes de activarlos.
export type CambioNotion = {
  notionPageId: string;
  notasDiscovery?: string;
  proximoPaso?: string;
  fechaProximoPaso?: string;
  fechaPrimerContacto?: string; // YYYY-MM-DD, se manda solo la primera vez (empresa sin toques previos)
  fechaUltimoContacto?: string; // YYYY-MM-DD, se manda en cada toque registrado
  toquesHechos?: string; // tabla en texto plano, una linea por toque (fecha, canal, resultado)
};

export interface SyncAdapter {
  actualizarPagina(cambio: CambioNotion): Promise<void>;
}
