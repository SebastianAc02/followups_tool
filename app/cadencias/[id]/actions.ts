'use server';

import { revalidatePath } from 'next/cache';
import { agregarVersionPaso, getCadencia } from '../../db/repository';
import { requireSession } from '../../lib/session';

// Fase 4 (cockpit de cadencia): iterar copy es agregar una version nueva y marcarla
// default (mismo patron que Fase 3.3/A-B de versionPaso), nunca reescribir la enviada.
// agregarVersionPaso ya existe en el repository; esta action solo la expone a la UI
// con la forma que necesita el editor inline (asunto + cuerpo, nombre auto).
export type EditarCopyResultado = { ok: true } | { ok: false; error: string };

export async function editarCopyPasoAction(idPaso: number, asunto: string, cuerpo: string, idCadencia: number): Promise<EditarCopyResultado> {
  await requireSession();
  try {
    const asuntoLimpio = asunto.trim();
    const cuerpoLimpio = cuerpo.trim();
    agregarVersionPaso(idPaso, {
      nombre: `editado-${Date.now()}`,
      ...(asuntoLimpio ? { asunto: asuntoLimpio } : {}),
      ...(cuerpoLimpio ? { cuerpo: cuerpoLimpio } : {}),
      esDefault: true,
      peso: 1,
    });
    revalidatePath(`/cadencias/${idCadencia}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar el copy' };
  }
}

export async function getCadenciaAction(idCadencia: number) {
  await requireSession();
  return getCadencia(idCadencia);
}
