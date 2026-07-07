'use server';

import { revalidatePath } from 'next/cache';
import { agregarVersionPaso, actualizarPasoCadencia, agregarPasoCadencia, getCadencia } from '../../db/repository';
import { requireSession } from '../../lib/session';
import type { Canal } from '../../db/validation';

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

// Fase 4 (cockpit de cadencia): dia/canal/aprobacion del constructor "Arma tu
// cadencia" ya tienen mutator real en el repository (actualizarPasoCadencia). Mismo
// patron try/catch que editarCopyPasoAction: la UI decide como mostrar el error, la
// action solo traduce excepcion -> resultado tipado.
export type ActualizarPasoResultado = { ok: true } | { ok: false; error: string };

export async function actualizarPasoCadenciaAction(
  idPaso: number,
  cambios: { diaOffset?: number; canal?: Canal; esManual?: boolean },
  idCadencia: number,
): Promise<ActualizarPasoResultado> {
  await requireSession();
  try {
    actualizarPasoCadencia(idPaso, cambios);
    revalidatePath(`/cadencias/${idCadencia}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar el cambio' };
  }
}

// Fase 4 (cockpit de cadencia): "+ Añadir toque" / "+ Añadir paso" de la UI. Crea el
// paso con el siguiente orden correlativo (lo decide el repository, no el caller) y
// su version_paso default; el usuario lo edita despues con los controles ya wireados.
export type AgregarPasoResultado = { ok: true; idPaso: number } | { ok: false; error: string };

export async function agregarPasoCadenciaAction(
  idCadencia: number,
  paso: { diaOffset: number; canal: Canal; objetivo?: string; esManual?: boolean; asunto?: string; cuerpo?: string },
): Promise<AgregarPasoResultado> {
  await requireSession();
  try {
    const idPaso = agregarPasoCadencia(idCadencia, paso);
    revalidatePath(`/cadencias/${idCadencia}`);
    return { ok: true, idPaso };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo añadir el paso' };
  }
}
