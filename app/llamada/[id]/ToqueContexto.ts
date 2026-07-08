// Glue server-side del cockpit de toque: decide qué vista renderizar y arma las
// props que necesita, a partir del ContextoToque (Repository) + los searchParams
// de la ruta. No tiene JSX ni reglas de dominio -- solo decide y empaqueta.
import type { ContextoToque } from '../../db/repository.ts';
import { urlNotion } from '../../lib/notion-url.ts';

export type VistaToque = 'llamada' | 'correo' | 'whatsapp' | 'confirmacion';

const CANAL_A_VISTA: Record<string, VistaToque> = {
  llamada: 'llamada',
  correo: 'correo',
  whatsapp: 'whatsapp',
};

// Decide la vista: `?vista=confirmacion` gana siempre (llega justo después de guardar
// un toque). Si no, se sigue el canal del paso activo de la secuencia; sin secuencia
// activa, el cockpit por defecto es la vista de llamada (canal más común en frío).
export function decidirVista(ctx: ContextoToque, searchParams: { vista?: string }): VistaToque {
  if (searchParams.vista === 'confirmacion') return 'confirmacion';
  const pasoActivo = ctx.secuencia.find((p) => p.estado === 'activo');
  return CANAL_A_VISTA[pasoActivo?.canal ?? ''] ?? 'llamada';
}

export function urlNotionDe(ctx: ContextoToque): string | null {
  return urlNotion(ctx.emp?.notionPageId ?? null);
}
