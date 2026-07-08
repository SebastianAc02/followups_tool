'use server';

import { revalidatePath } from 'next/cache';
import { parsearCadenciaPorFormato, type FormatoCadencia } from '../../core/cadencia-parser';
import { crearCadencia, crearCampana, actualizarCampanaBasico, getCadencia, eliminarCampanaBorrador } from '../../db/repository';
import type { ModoCampana } from '../../db/validation';
import { requireSession } from '../../lib/session';
import type { PasoCadenciaUI } from '../../cadencias/[id]/CadenciaCockpit';

type PasoPreview = {
  orden: number;
  diaOffset: number;
  canal: string;
  asunto?: string;
  cuerpo?: string;
  objetivo?: string;
  variables: string[];
  firmaApollo: boolean;
};

// Parte 3 campanas: previsualiza el markdown/CSV YA parseado (canal, copy,
// variables, firma) antes de persistir nada. Solo corre el parser puro; no toca DB.
export type PreviewCadencia = { ok: true; nombre: string; descripcion?: string; pasos: PasoPreview[] } | { ok: false; error: string };

export async function previsualizarCadenciaAction(formato: FormatoCadencia, contenido: string, nombreCsv?: string): Promise<PreviewCadencia> {
  await requireSession();
  try {
    const parseada = parsearCadenciaPorFormato(formato, contenido, { nombre: nombreCsv || 'Cadencia sin nombre' });
    return {
      ok: true,
      nombre: parseada.nombre,
      descripcion: parseada.descripcion,
      pasos: parseada.pasos.map((p) => ({ ...p, variables: p.variables ?? [], firmaApollo: p.firmaApollo ?? false })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo leer la cadencia' };
  }
}

export type CrearBorradorResultado =
  | { ok: true; idCampana: number; idCadencia: number; pasos: PasoCadenciaUI[] }
  | { ok: false; error: string };

// Draft persistente: en cuanto la cadencia parsea bien, nace la campana en estado
// 'borrador' (crearCampana NO inscribe a nadie). El punto mas temprano posible: el
// schema exige id_cadencia + id_segmento NOT NULL, y aca ya estan los dos. Si el
// usuario cierra la pestaña despues de esto, el draft sigue vivo con su propio id
// y se retoma desde /campanas (hub) -> tarjeta -> /campanas/[id].
//
// Devuelve idCadencia + pasos (no solo idCampana) para que CadenciaPaso pueda montar
// CadenciaCockpit de una -- el MISMO editor "Arma tu cadencia" que usa una campana ya
// creada, en vez de un preview de solo lectura distinto solo por estar en creacion.
export async function crearBorradorDesdeCadenciaAction(input: {
  idSegmento: number;
  formato: FormatoCadencia;
  contenido: string;
  nombreCsv?: string;
}): Promise<CrearBorradorResultado> {
  await requireSession();
  try {
    const parseada = parsearCadenciaPorFormato(input.formato, input.contenido, { nombre: input.nombreCsv || 'Cadencia sin nombre' });
    const idCadencia = crearCadencia(parseada);
    const idCampana = crearCampana({ nombre: parseada.nombre, idCadencia, idSegmento: input.idSegmento, modo: 'prioritaria' });
    revalidatePath('/campanas');
    const datos = getCadencia(idCadencia);
    return { ok: true, idCampana, idCadencia, pasos: datos?.pasos ?? [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo crear el borrador' };
  }
}

// Fase 7: "Cambiar cadencia" en creacion abandonaba el borrador anterior (campana +
// cadencia) sin borrarlo -- quedaba vivo como zombie en 'borrador' para siempre. Como
// crearBorradorDesdeCadenciaAction crea uno nuevo cada vez que se resuelve un archivo,
// hay que limpiar el anterior antes de reemplazarlo. Reusa eliminarCampanaBorrador
// (ya rechaza borrar algo que no sea un borrador limpio, defensa suficiente aca).
export async function abandonarBorradorAction(idCampana: number): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSession();
  return eliminarCampanaBorrador(idCampana);
}

export type ActualizarBorradorResultado = { ok: true } | { ok: false; error: string };

export async function actualizarBorradorAction(
  idCampana: number,
  cambios: { nombre?: string; modo?: ModoCampana },
): Promise<ActualizarBorradorResultado> {
  await requireSession();
  try {
    actualizarCampanaBasico(idCampana, cambios);
    revalidatePath('/campanas');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar el cambio' };
  }
}
