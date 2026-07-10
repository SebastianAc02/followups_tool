'use server';

import { revalidatePath } from 'next/cache';
import {
  guardarSegmento,
  actualizarSegmento,
  obtenerSegmento,
  empresasConReadiness,
  conteosReadiness,
  valoresDistintosCampo,
  eliminarCampanaBorrador,
  idsExcluidosDeSegmento,
  excluirDeSegmento,
  incluirDeSegmento,
} from '../db/repository';
import { CANALES, type Canal, definicionSegmentoSchema, type DefinicionSegmento } from '../db/validation';
import { requireSession } from '../lib/session';
import { crearClaudeAdapter } from '../adapters/claude';
import { pedirAlCopiloto, type CampoDisponible } from './nueva/copiloto';
import { marcarRelajadas } from '../core/relleno-segmento';

export type EliminarBorradorResultado = { ok: true } | { ok: false; error: string };

export async function eliminarCampanaBorradorAction(idCampana: number): Promise<EliminarBorradorResultado> {
  await requireSession();
  const res = eliminarCampanaBorrador(idCampana);
  if (res.ok) revalidatePath('/campanas');
  return res;
}

export type GuardarSegmentoResultado = { ok: true; idSegmento: number } | { ok: false; error: string };

export async function guardarSegmentoAction(nombre: string, def: DefinicionSegmento): Promise<GuardarSegmentoResultado> {
  const sesion = await requireSession();
  const limpio = nombre.trim();
  if (!limpio) return { ok: false, error: 'El segmento necesita un nombre' };
  try {
    const idSegmento = guardarSegmento({ nombre: limpio, definicion: def }, sesion.idOrganizacion);
    revalidatePath('/campanas/nueva');
    return { ok: true, idSegmento };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar el segmento' };
  }
}

export type ActualizarSegmentoResultado = { ok: true } | { ok: false; error: string };

// Fase 7 (autosave silencioso): actualiza el MISMO segmento que ya autoguardo esta
// sesion (ver NuevoSegmento.tsx) -- nombre y/o definicion, lo que haya cambiado.
export async function actualizarSegmentoAction(
  idSegmento: number,
  cambios: { nombre?: string; definicion?: DefinicionSegmento },
): Promise<ActualizarSegmentoResultado> {
  const sesion = await requireSession();
  try {
    actualizarSegmento(idSegmento, cambios, sesion.idOrganizacion);
    revalidatePath('/campanas/nueva');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo actualizar el segmento' };
  }
}

export type ObtenerSegmentoResultado =
  | { ok: true; segmento: { id: number; nombre: string; definicion: DefinicionSegmento; descripcionNatural: string | null } }
  | { ok: false; error: string };

// Fase 7 (volver a Segmento sin perder el progreso): reabre NuevoSegmento pre-cargado
// con la MISMA definicion que ya se habia armado, en vez de vacio.
export async function obtenerSegmentoAction(idSegmento: number): Promise<ObtenerSegmentoResultado> {
  const sesion = await requireSession();
  const segmento = obtenerSegmento(idSegmento, sesion.idOrganizacion);
  if (!segmento) return { ok: false, error: 'El segmento no existe' };
  return { ok: true, segmento };
}

export type PreviewConReadiness =
  | { ok: true; conteos: ReturnType<typeof conteosReadiness>; filas: (ReturnType<typeof empresasConReadiness>[number] & { relajada: boolean })[] }
  | { ok: false; error: string };

// Sin cadencia todavia (llega en Fase D), asi que el readiness se calcula exigiendo los
// 3 canales del dominio -- es el peor caso, informativo para elegir el segmento. Fase D
// recalcula con los canales reales de la cadencia elegida.
const CANALES_TODOS: Canal[] = [...CANALES];

export async function previsualizarConReadinessAction(def: DefinicionSegmento, idsEstrictos?: string[]): Promise<PreviewConReadiness> {
  const sesion = await requireSession();
  try {
    const val = definicionSegmentoSchema.parse(def);
    const filas = empresasConReadiness(val, CANALES_TODOS, 'saltar', sesion.idOrganizacion);
    const conteos = conteosReadiness(val, CANALES_TODOS, 'saltar', sesion.idOrganizacion);
    const marcas = idsEstrictos ? marcarRelajadas(idsEstrictos, filas.map((f) => f.id)) : filas.map((f) => ({ id: f.id, relajada: false }));
    const relajadaPorId = new Map(marcas.map((m) => [m.id, m.relajada]));
    return { ok: true, conteos, filas: filas.map((f) => ({ ...f, relajada: relajadaPorId.get(f.id) ?? false })) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'definicion de segmento invalida' };
  }
}

// Parte 2 campanas (curado manual): la tabla del segmento excluye/incluye cuentas una
// por una. Leer el set inicial (para pintar los checkboxes) va separado del toggle --
// la lectura corre en cada montaje/cambio de segmento; el toggle solo cuando Sebastian
// destilda. Ambos heredan el guard por organizacion del Repository.
export async function exclusionesDeSegmentoAction(idSegmento: number): Promise<string[]> {
  const sesion = await requireSession();
  return idsExcluidosDeSegmento(idSegmento, sesion.idOrganizacion);
}

export type AlternarExclusionResultado = { ok: true } | { ok: false; error: string };

export async function alternarExclusionAction(
  idSegmento: number,
  idEmpresa: string,
  excluir: boolean,
): Promise<AlternarExclusionResultado> {
  const sesion = await requireSession();
  try {
    if (excluir) excluirDeSegmento(idSegmento, idEmpresa, sesion.idOrganizacion);
    else incluirDeSegmento(idSegmento, idEmpresa, sesion.idOrganizacion);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo actualizar la exclusión' };
  }
}

const CAMPOS_TEXTO_COPILOTO = ['estado', 'categoria', 'estado_comercial', 'ciudad', 'departamento', 'owner', 'rol'] as const;

export type CopilotoResultado = Awaited<ReturnType<typeof pedirAlCopiloto>>;

// El Copiloto solo conoce los campos/valores que le pasamos aca (traidos del Repository);
// nunca consulta la DB por su cuenta. Los numericos (usuarios, personas) no tienen lista
// de valores -- se filtran por rango, no por membresia.
export async function copilotoAction(frase: string, estadoActual: DefinicionSegmento, total?: number): Promise<CopilotoResultado> {
  const sesion = await requireSession();
  const campos: CampoDisponible[] = [
    ...CAMPOS_TEXTO_COPILOTO.map((campo) => ({ campo, ejemplosValor: valoresDistintosCampo(campo, sesion.idOrganizacion) })),
    { campo: 'usuarios', numerico: true },
    { campo: 'personas', numerico: true },
  ];
  return pedirAlCopiloto({ frase, estadoActual, seleccion: total != null ? { total } : undefined }, crearClaudeAdapter(), campos);
}
