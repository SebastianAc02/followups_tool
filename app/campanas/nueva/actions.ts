'use server';

import { revalidatePath } from 'next/cache';
import { parsearCadenciaCsv, parsearCadenciaMarkdown } from '../../core/cadencia-parser';
import { crearCadencia, crearCampana, inscribirCampana, type ResultadoInscripcion } from '../../db/repository';
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

export async function previsualizarCadenciaAction(formato: 'md' | 'csv', contenido: string, nombreCsv?: string): Promise<PreviewCadencia> {
  await requireSession();
  try {
    const parseada =
      formato === 'csv' ? parsearCadenciaCsv(contenido, { nombre: nombreCsv || 'Cadencia sin nombre' }) : parsearCadenciaMarkdown(contenido);
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

export type CrearCampanaResultado =
  | { ok: true; idCampana: number; resultado: ResultadoInscripcion }
  | { ok: false; error: string };

// Parte 3 campanas: al confirmar, persiste todo de una vez (cadencia + campana +
// inscripcion sobre el set curado por la revision de Parte 2). Reusa el mismo
// parser de la previsualizacion: lo que se vio en pantalla es lo que se guarda.
export async function crearCampanaConCadenciaAction(input: {
  nombreCampana: string;
  idSegmento: number;
  formato: 'md' | 'csv';
  contenido: string;
  nombreCsv?: string;
  modo: ModoCampana;
}): Promise<CrearCampanaResultado> {
  await requireSession();
  const nombreCampana = input.nombreCampana.trim();
  if (!nombreCampana) return { ok: false, error: 'La campaña necesita un nombre' };

  try {
    const parseada =
      input.formato === 'csv'
        ? parsearCadenciaCsv(input.contenido, { nombre: input.nombreCsv || nombreCampana })
        : parsearCadenciaMarkdown(input.contenido);
    const idCadencia = crearCadencia(parseada);
    const idCampana = crearCampana({ nombre: nombreCampana, idCadencia, idSegmento: input.idSegmento, modo: input.modo });
    const resultado = inscribirCampana(idCampana);
    revalidatePath('/campanas/nueva');
    return { ok: true, idCampana, resultado };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo crear la campaña' };
  }
}
