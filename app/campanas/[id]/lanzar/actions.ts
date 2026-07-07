'use server';

import { revalidatePath } from 'next/cache';
import {
  campanaParaLanzar,
  actualizarConfigLanzamiento,
  inscribirCampana,
  guardarProveedorCampanaId,
  toquesGlobalesHoy,
  type CampanaParaLanzar,
  type ConfigLanzamientoInput,
  type ResultadoInscripcion,
} from '../../../db/repository';
import { requireSession } from '../../../lib/session';
import { calcularGoteo, type ResultadoGoteo } from '../../../core/goteo';
import { crearApolloAdapter } from '../../../adapters/apollo';

// Fase 8 (Lanzar), Task 8.4: recalcula la barra "asi se distribuye" con los valores QUE
// EL USUARIO TIENE EN PANTALLA, sin guardar nada todavia -- mismo patron que
// recalcularConteosAction de Fase 5 (Reglas). calcularGoteo (core, puro) ya hace el trabajo;
// esta action solo resuelve el total de elegibles (via campanaParaLanzar, que a su vez reusa
// previsualizarInscripcionCampana de Fase 6) para no reimplementar esa clasificacion aqui.
export type RecalcularGoteoResultado = { ok: true; goteo: ResultadoGoteo; totalElegibles: number } | { ok: false; error: string };

export async function recalcularGoteoAction(
  idCampana: number,
  config: { intakeDiario: number; ritmoIngreso: 'diario' | 'dia_si_dia_no' | 'personalizado'; fechaInicio: string },
): Promise<RecalcularGoteoResultado> {
  await requireSession();
  try {
    const camp = campanaParaLanzar(idCampana);
    if (!camp) return { ok: false, error: 'La campaña no existe' };
    const goteo = calcularGoteo(camp.totalElegibles, config.intakeDiario, config.ritmoIngreso, config.fechaInicio);
    return { ok: true, goteo, totalElegibles: camp.totalElegibles };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo recalcular el goteo' };
  }
}

// Guarda la config de goteo/ritmo/tope/fecha ANTES de lanzar. Se llama al confirmar
// "Lanzar hoy" (junto con lanzarCampanaAction) para que inscribirCampana lea la config
// ya persistida -- inscribirCampana en si no recibe estos valores como parametro (Task 8.3,
// los lee de la propia fila de campana), asi que persistirlos primero es un paso real, no
// cosmetico.
export type GuardarConfigResultado = { ok: true; campana: CampanaParaLanzar } | { ok: false; error: string };

export async function guardarConfigLanzamientoAction(idCampana: number, config: ConfigLanzamientoInput): Promise<GuardarConfigResultado> {
  await requireSession();
  try {
    actualizarConfigLanzamiento(idCampana, config);
    const camp = campanaParaLanzar(idCampana);
    if (!camp) return { ok: false, error: 'La campaña no existe' };
    revalidatePath(`/campanas/${idCampana}/lanzar`);
    return { ok: true, campana: camp };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar la configuración' };
  }
}

// Botón "Lanzar hoy": persiste la config final y dispara inscribirCampana (que ya usa el
// goteo internamente, Task 8.3 -- esta action no reimplementa el enrollment, solo lo llama).
export type LanzarCampanaResultado =
  | { ok: true; resultado: ResultadoInscripcion; avisoSecuenciaExterna?: string }
  | { ok: false; error: string };

export async function lanzarCampanaAction(idCampana: number, config: ConfigLanzamientoInput): Promise<LanzarCampanaResultado> {
  await requireSession();
  try {
    actualizarConfigLanzamiento(idCampana, config);
    const resultado = inscribirCampana(idCampana);

    // La campana YA quedo inscrita en la DB local en este punto (fuente de la verdad).
    // Crear la secuencia en Apollo es un paso adicional: si falla (sin credencial,
    // timeout, etc.) no se revierte lo inscrito ni se bloquea la accion -- se avisa
    // en el resultado para que la UI lo muestre, nada mas.
    let avisoSecuenciaExterna: string | undefined;
    try {
      const camp = campanaParaLanzar(idCampana);
      if (camp) {
        const proveedorCampanaId = await crearApolloAdapter().crearCampanaExterna(camp.nombre);
        guardarProveedorCampanaId(idCampana, proveedorCampanaId);
      }
    } catch (e) {
      avisoSecuenciaExterna = `la campaña se lanzó pero no se pudo crear la secuencia en Apollo: ${
        e instanceof Error ? e.message : String(e)
      }`;
    }

    revalidatePath(`/campanas/${idCampana}/lanzar`);
    revalidatePath('/campanas');
    return { ok: true, resultado, ...(avisoSecuenciaExterna ? { avisoSecuenciaExterna } : {}) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo lanzar la campaña' };
  }
}

// Carga informativa (segundo plano, sin bloquear el lanzamiento) de la suma entre TODAS
// las campañas activas -- toquesGlobalesHoy ya existe (Fase 8.1), esta action solo la expone
// al cliente para el bloque secundario de la UI.
export type CargaGlobalResultado = { ok: true; totalHoy: number; campanasActivas: number } | { ok: false; error: string };

export async function cargaGlobalHoyAction(): Promise<CargaGlobalResultado> {
  await requireSession();
  try {
    const { totalHoy, campanasActivas } = toquesGlobalesHoy();
    return { ok: true, totalHoy, campanasActivas };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo calcular la carga global' };
  }
}
