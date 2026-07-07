'use server';

import { revalidatePath } from 'next/cache';
import { parsearCadenciaPorFormato, type FormatoCadencia } from '../../core/cadencia-parser';
import { crearCadencia, crearCampana, actualizarCampanaBasico } from '../../db/repository';
import type { ModoCampana } from '../../db/validation';
import { requireSession } from '../../lib/session';

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

export type CrearBorradorResultado = { ok: true; idCampana: number } | { ok: false; error: string };

// Draft persistente: en cuanto la cadencia parsea bien, nace la campana en estado
// 'borrador' (crearCampana NO inscribe a nadie). El punto mas temprano posible: el
// schema exige id_cadencia + id_segmento NOT NULL, y aca ya estan los dos. Si el
// usuario cierra la pestaña despues de esto, el draft sigue vivo con su propio id
// y se retoma desde /campanas (hub) -> tarjeta -> /campanas/[id].
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
    return { ok: true, idCampana };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo crear el borrador' };
  }
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
