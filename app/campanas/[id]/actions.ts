'use server';

import { revalidatePath } from 'next/cache';
import {
  pausarCampana,
  reanudarCampana,
  marcarCampanaFinalizada,
  campanaParaSincronizarCopy,
  pasosParaSincronizarCopy,
  guardarSincronizacionCopy,
} from '../../db/repository';
import { requireSession } from '../../lib/session';
import { crearApolloAdapter } from '../../adapters/apollo';

// Fase 7 (ciclo de vida de campana): Pausar/Reanudar son reversibles y solo tocan
// campana.estado -- ver pausarCampana/reanudarCampana en el repository. Cancelar es
// distinto: es la unica operacion que Apollo expone de verdad para "parar del todo"
// (archivarCampana -> POST /emailer_campaigns/{id}/archive, verificado en vivo, ver
// planning/experimento-apollo.md) y NO tiene vuelta atras (Apollo no tiene
// unarchive por API). Por eso no existe un "Pausar en Apollo": lo unico real que la
// API ofrece ahi es este archivo de una via, asi que se expone como Cancelar, no
// como Pausar, para no prometer un reversible que Apollo no tiene.
export type CicloVidaResultado = { ok: true } | { ok: false; error: string };

export async function pausarCampanaAction(idCampana: number): Promise<CicloVidaResultado> {
  await requireSession();
  const res = pausarCampana(idCampana);
  if (res.ok) revalidatePath(`/campanas/${idCampana}`);
  return res;
}

export async function reanudarCampanaAction(idCampana: number): Promise<CicloVidaResultado> {
  await requireSession();
  const res = reanudarCampana(idCampana);
  if (res.ok) revalidatePath(`/campanas/${idCampana}`);
  return res;
}

export async function cancelarCampanaAction(idCampana: number): Promise<CicloVidaResultado> {
  await requireSession();
  const res = marcarCampanaFinalizada(idCampana);
  if (!res.ok) return res;
  if (res.proveedorCampanaId) {
    try {
      await crearApolloAdapter().archivarCampana(res.proveedorCampanaId);
    } catch (e) {
      // La campana ya quedo 'finalizada' en la base (fuente de la verdad); si Apollo
      // fallo, el residuo es una secuencia externa viva sin campana activa detras --
      // no bloquea al usuario, pero se lo decimos para que sepa que puede quedar
      // pendiente archivarla a mano en Apollo.
      return { ok: false, error: `Se canceló en la base, pero Apollo no confirmó el archivado: ${e instanceof Error ? e.message : 'error desconocido'}` };
    }
  }
  revalidatePath(`/campanas/${idCampana}`);
  revalidatePath('/campanas');
  return { ok: true };
}

// Subir/editar copy en Apollo (sesion 2026-07-08): reintentable a proposito -- sirve
// tanto para la primera subida (secuencia recien creada, vacia) como para volver a
// apretar el boton despues de editar un paso en /cadencias. sincronizarCopy es
// create-si-falta/update-si-existe por dentro (ver apollo.ts), asi que llamarlo dos
// veces seguidas nunca duplica un step.
export type SincronizarCopyResultado = { ok: true; pasos: number } | { ok: false; error: string };

export async function sincronizarCopyApolloAction(idCampana: number): Promise<SincronizarCopyResultado> {
  await requireSession();
  const camp = campanaParaSincronizarCopy(idCampana);
  if (!camp) {
    return { ok: false, error: 'Esta campaña todavía no tiene una secuencia creada en Apollo.' };
  }
  const pasos = pasosParaSincronizarCopy(camp.idCadencia);
  if (pasos.length === 0) {
    return { ok: false, error: 'La cadencia de esta campaña no tiene pasos con copy.' };
  }
  try {
    const sincronizados = await crearApolloAdapter().sincronizarCopy(camp.proveedorCampanaId, pasos);
    guardarSincronizacionCopy(sincronizados);
    revalidatePath(`/campanas/${idCampana}`);
    return { ok: true, pasos: sincronizados.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo subir el copy a Apollo' };
  }
}
