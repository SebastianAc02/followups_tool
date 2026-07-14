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

// Decide la vista: `?vista=confirmacion` gana siempre (llega justo despues de guardar
// un toque). Si hay un paso activo en la secuencia, ese canal manda -- una cadencia en
// curso no se puede desviar con un ?vista= que no coincide. Sin paso activo, el
// ?vista= explicito (2026-07-14: toques sueltos desde "Contacto iniciado sin
// seguimiento") elige el editor; sin nada de eso, el cockpit por defecto es la vista
// de llamada (canal mas comun en frio).
export function decidirVista(ctx: ContextoToque, searchParams: { vista?: string }): VistaToque {
  if (searchParams.vista === 'confirmacion') return 'confirmacion';
  const pasoActivo = ctx.secuencia.find((p) => p.estado === 'activo');
  if (pasoActivo) return CANAL_A_VISTA[pasoActivo.canal] ?? 'llamada';
  if (searchParams.vista === 'correo' || searchParams.vista === 'whatsapp' || searchParams.vista === 'llamada') {
    return searchParams.vista;
  }
  return 'llamada';
}

export function urlNotionDe(ctx: ContextoToque): string | null {
  return urlNotion(ctx.emp?.notionPageId ?? null);
}
