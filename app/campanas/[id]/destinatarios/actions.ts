'use server';

import { previsualizarInscripcionCampana, type FilaPreviewInscripcion } from '../../../db/repository';
import { requireSession } from '../../../lib/session';

// Fase 6 (V4 Destinatarios): action de solo lectura, sin escribir nada -- el preview
// que ve Sebastian en pantalla es de usar y tirar. inscribirCampana (Repository)
// nunca recibe este resultado como snapshot de verdad, vuelve a calcular contra el
// estado actual de la DB justo antes de persistir (decision de Sebastian, checkpoint
// 6.1 en app/core/preview-inscripcion.ts).
export type PreviewInscripcionResultado = { ok: true; filas: FilaPreviewInscripcion[] } | { ok: false; error: string };

export async function previsualizarInscripcionAction(idCampana: number): Promise<PreviewInscripcionResultado> {
  const sesion = await requireSession();
  try {
    const filas = previsualizarInscripcionCampana(idCampana, sesion.idOrganizacion);
    if (filas == null) return { ok: false, error: 'La campaña no existe' };
    return { ok: true, filas };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo calcular el preview de inscripción' };
  }
}
