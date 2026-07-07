'use server';

import { revalidatePath } from 'next/cache';
import {
  guardarSegmento,
  empresasConReadiness,
  conteosReadiness,
  valoresDistintosCampo,
} from '../db/repository';
import { CANALES, type Canal, definicionSegmentoSchema, type DefinicionSegmento } from '../db/validation';
import { requireSession } from '../lib/session';
import { crearClaudeAdapter } from '../adapters/claude';
import { pedirAlCopiloto, type CampoDisponible } from './nueva/copiloto';
import { marcarRelajadas } from '../core/relleno-segmento';

export type GuardarSegmentoResultado = { ok: true; idSegmento: number } | { ok: false; error: string };

export async function guardarSegmentoAction(nombre: string, def: DefinicionSegmento): Promise<GuardarSegmentoResultado> {
  await requireSession();
  const limpio = nombre.trim();
  if (!limpio) return { ok: false, error: 'El segmento necesita un nombre' };
  try {
    const idSegmento = guardarSegmento({ nombre: limpio, definicion: def });
    revalidatePath('/campanas/nueva');
    return { ok: true, idSegmento };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar el segmento' };
  }
}

export type PreviewConReadiness =
  | { ok: true; conteos: ReturnType<typeof conteosReadiness>; filas: (ReturnType<typeof empresasConReadiness>[number] & { relajada: boolean })[] }
  | { ok: false; error: string };

// Sin cadencia todavia (llega en Fase D), asi que el readiness se calcula exigiendo los
// 3 canales del dominio -- es el peor caso, informativo para elegir el segmento. Fase D
// recalcula con los canales reales de la cadencia elegida.
const CANALES_TODOS: Canal[] = [...CANALES];

export async function previsualizarConReadinessAction(def: DefinicionSegmento, idsEstrictos?: string[]): Promise<PreviewConReadiness> {
  await requireSession();
  try {
    const val = definicionSegmentoSchema.parse(def);
    const filas = empresasConReadiness(val, CANALES_TODOS, 'saltar');
    const conteos = conteosReadiness(val, CANALES_TODOS, 'saltar');
    const marcas = idsEstrictos ? marcarRelajadas(idsEstrictos, filas.map((f) => f.id)) : filas.map((f) => ({ id: f.id, relajada: false }));
    const relajadaPorId = new Map(marcas.map((m) => [m.id, m.relajada]));
    return { ok: true, conteos, filas: filas.map((f) => ({ ...f, relajada: relajadaPorId.get(f.id) ?? false })) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'definicion de segmento invalida' };
  }
}

const CAMPOS_TEXTO_COPILOTO = ['estado', 'categoria', 'estado_comercial', 'ciudad', 'departamento', 'owner', 'rol'] as const;

export type CopilotoResultado = Awaited<ReturnType<typeof pedirAlCopiloto>>;

// El Copiloto solo conoce los campos/valores que le pasamos aca (traidos del Repository);
// nunca consulta la DB por su cuenta. Los numericos (usuarios, personas) no tienen lista
// de valores -- se filtran por rango, no por membresia.
export async function copilotoAction(frase: string, estadoActual: DefinicionSegmento, total?: number): Promise<CopilotoResultado> {
  await requireSession();
  const campos: CampoDisponible[] = [
    ...CAMPOS_TEXTO_COPILOTO.map((campo) => ({ campo, ejemplosValor: valoresDistintosCampo(campo) })),
    { campo: 'usuarios', numerico: true },
    { campo: 'personas', numerico: true },
  ];
  return pedirAlCopiloto({ frase, estadoActual, seleccion: total != null ? { total } : undefined }, crearClaudeAdapter(), campos);
}
