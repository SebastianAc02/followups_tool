// El core define QUE cambia en el CRM, no COMO se escribe. Verificado contra el
// schema real del "Sales Pipeline" de Notion (2026-07-06): Notas Discovery y Proximo
// Paso son texto libre, Fecha Proximo Paso es fecha. Estado es tipo "status" (no
// texto ni select simple) -- fuera de alcance de este primer corte, requiere mapear
// contra los grupos de status reales de Notion antes de escribirlo con seguridad.
export type CambioNotion = {
  notionPageId: string;
  notasDiscovery?: string;
  proximoPaso?: string;
  fechaProximoPaso?: string;
};

export interface SyncAdapter {
  actualizarPagina(cambio: CambioNotion): Promise<void>;
}
