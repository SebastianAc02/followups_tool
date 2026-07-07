'use server';

import { revalidatePath } from 'next/cache';
import { campanaConReglas, conteosReadiness, actualizarReglaFaltante, type ConteosReadiness } from '../../../db/repository';
import { requireSession } from '../../../lib/session';
import type { ReglaFaltante } from '../../../core/canales-empresa';

// Fase 5 (vista Reglas): recalcula los 3 conteos para una regla candidata SIN
// persistir nada. La UI llama esto cada vez que el usuario toca una opcion distinta
// a la guardada; el calculo en si (conteosReadiness) ya vive en el repository/core,
// esta action solo resuelve la campana -> segmento -> canalesRequeridos y lo expone.
export type RecalcularReglaResultado = { ok: true; conteos: ConteosReadiness } | { ok: false; error: string };

export async function recalcularConteosAction(idCampana: number, regla: ReglaFaltante): Promise<RecalcularReglaResultado> {
  await requireSession();
  try {
    const camp = campanaConReglas(idCampana);
    if (!camp) return { ok: false, error: 'La campaña no existe' };
    const conteos = conteosReadiness(camp.definicionSegmento, camp.canalesRequeridos, regla);
    return { ok: true, conteos };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudieron recalcular los conteos' };
  }
}

// Guarda la regla elegida. Se llama solo cuando el usuario confirma explicitamente
// (boton "Guardar regla"), nunca al tocar una opcion — cambiar de opcion solo
// recalcula en memoria via recalcularConteosAction.
export type GuardarReglaResultado = { ok: true } | { ok: false; error: string };

export async function guardarReglaFaltanteAction(idCampana: number, regla: ReglaFaltante): Promise<GuardarReglaResultado> {
  await requireSession();
  try {
    actualizarReglaFaltante(idCampana, regla);
    revalidatePath(`/campanas/${idCampana}/reglas`);
    revalidatePath('/campanas');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar la regla' };
  }
}
