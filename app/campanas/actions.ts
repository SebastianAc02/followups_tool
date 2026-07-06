'use server';

import { revalidatePath } from 'next/cache';
import { empresasDeSegmento, guardarSegmento, excluirDeSegmento, incluirDeSegmento } from '../db/repository';
import { definicionSegmentoSchema, type DefinicionSegmento } from '../db/validation';
import { requireSession } from '../lib/session';

// Parte 1 campanas: el builder manda la definicion completa en cada cambio y recibe
// conteo + muestra. Todo pasa por Zod en el Repository; aca solo se atrapa el error
// para que la UI lo pinte en vez de tumbar la pagina.
export type PreviewSegmento =
  | {
      ok: true;
      total: number;
      muestra: { id: string; nombre: string | null; estado: string | null; categoria: string | null; usuarios: number | null }[];
      // Cuantas empresas cumplen el resto de condiciones pero NO tienen dato de
      // usuarios (un rango nunca matchea NULL). Solo se calcula si hay condicion
      // entre sobre usuarios; si no, null.
      sinDatoUsuarios: number | null;
    }
  | { ok: false; error: string };

export async function previsualizarSegmentoAction(def: DefinicionSegmento): Promise<PreviewSegmento> {
  await requireSession();
  try {
    const val = definicionSegmentoSchema.parse(def);
    const empresas = empresasDeSegmento(val);

    let sinDatoUsuarios: number | null = null;
    const tieneRangoUsuarios = val.condiciones.some((c) => c.campo === 'usuarios' && c.op === 'entre');
    if (tieneRangoUsuarios) {
      // Mismas condiciones, pero el rango de usuarios se reemplaza por es_null:
      // "las que se te escaparon por no tener dato". Reusa el mismo motor, cero SQL nuevo.
      const resto = val.condiciones.filter((c) => !(c.campo === 'usuarios' && c.op === 'entre'));
      const defNull: DefinicionSegmento = {
        condiciones: [...resto, { campo: 'usuarios', op: 'es_null' }],
      };
      sinDatoUsuarios = empresasDeSegmento(defNull).length;
    }

    return { ok: true, total: empresas.length, muestra: empresas.slice(0, 20), sinDatoUsuarios };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'definicion de segmento invalida' };
  }
}

export type GuardarSegmentoResultado = { ok: true; idSegmento: number } | { ok: false; error: string };

export async function guardarSegmentoAction(nombre: string, def: DefinicionSegmento): Promise<GuardarSegmentoResultado> {
  await requireSession();
  const limpio = nombre.trim();
  if (!limpio) return { ok: false, error: 'El segmento necesita un nombre' };
  try {
    const idSegmento = guardarSegmento({ nombre: limpio, definicion: def });
    revalidatePath('/campanas/segmentos');
    return { ok: true, idSegmento };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar el segmento' };
  }
}

// Parte 2 campanas: revision de leads. El toggle persiste de inmediato (no hay un
// "guardar" aparte): excluir/incluir son operaciones idempotentes en el Repository.
export async function excluirLeadAction(idSegmento: number, idEmpresa: string): Promise<void> {
  await requireSession();
  excluirDeSegmento(idSegmento, idEmpresa);
  revalidatePath(`/campanas/segmentos/${idSegmento}/revision`);
}

export async function incluirLeadAction(idSegmento: number, idEmpresa: string): Promise<void> {
  await requireSession();
  incluirDeSegmento(idSegmento, idEmpresa);
  revalidatePath(`/campanas/segmentos/${idSegmento}/revision`);
}
