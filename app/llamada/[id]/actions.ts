"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  registrarToque,
  terminosBusquedaTranscript,
  leerToqueTranscript,
  escribirTranscriptCompleto,
  escribirTranscriptSoloPuntero,
} from "../../db/repository";
import { registrarToqueSchema } from "../../db/validation";
import { requireSession } from "../../lib/session";
import { crearGranolaAdapter } from "../../adapters/granola";
import { crearClaudeAdapter } from "../../adapters/claude";
import { agruparCandidatas, type CandidataOFusion } from "../../core/matcher";
import { confirmarTranscript } from "../../core/confirmarTranscript";
import { estructurarToque, type ToqueEstructurado } from "../../core/estructurar-toque";

export async function registrarToqueAction(formData: FormData) {
  await requireSession();
  const idEmpresa = String(formData.get("idEmpresa") ?? "");
  const resultado = String(formData.get("resultado") ?? "");
  if (!idEmpresa || !resultado) return;

  // Canal REAL de este toque. CaptureForm (V1.3) siempre lo manda con un selector visible;
  // el default "llamada" solo cubre el caso defensivo de un FormData incompleto.
  const canal = String(formData.get("toqueCanal") ?? "llamada").trim() || "llamada";

  const quePaso = String(formData.get("quePaso") ?? "").trim() || undefined;
  const fecha = String(formData.get("fecha") ?? "").trim() || undefined;
  const proximoCanal = String(formData.get("canal") ?? "").trim() || undefined;
  const usuariosRaw = String(formData.get("usuarios") ?? "").trim();
  const usuarios = usuariosRaw ? Number(usuariosRaw) : undefined;
  const crm = String(formData.get("crm") ?? "").trim() || undefined;
  const pasarela = String(formData.get("pasarela") ?? "").trim() || undefined;

  const razonPerdida = String(formData.get("razonPerdida") ?? "").trim() || undefined;
  const objecion = String(formData.get("objecion") ?? "").trim() || undefined;

  const kdmNombre = String(formData.get("kdmNombre") ?? "").trim() || undefined;
  const kdmTelefono = String(formData.get("kdmTelefono") ?? "").trim() || undefined;
  const kdm = kdmNombre ? { nombre: kdmNombre, telefono: kdmTelefono } : undefined;

  // Validación temprana con el mismo schema del Repository: da un error de formulario más
  // amable aquí, pero la fuente de verdad de la regla vive en registrarToque.
  const parsed = registrarToqueSchema.parse({
    idEmpresa,
    canal,
    resultado,
    quePaso,
    proximoFollowUp: fecha,
    proximoCanal,
    usuarios,
    crm,
    pasarela,
    razonPerdida,
    objecion,
    kdm,
  });

  registrarToque(parsed);

  revalidatePath("/");
  redirect("/");
}

const VENTANA_HORAS = 12;

function sumarHoras(iso: string, horas: number): string {
  return new Date(new Date(iso).getTime() + horas * 60 * 60 * 1000).toISOString();
}

// V3.4: busca en Granola por los terminos de esta empresa/contacto, en una ventana
// de tiempo alrededor del toque. No persiste nada, el buscar es de solo lectura,
// solo confirmarGrabacionAction escribe.
export async function buscarGrabacionAction(idToque: number): Promise<CandidataOFusion[]> {
  const sesion = await requireSession();
  const datos = terminosBusquedaTranscript(idToque);
  if (!datos || datos.terminos.length === 0) return [];

  const adapter = crearGranolaAdapter(sesion.id);
  const desde = sumarHoras(datos.fecha, -VENTANA_HORAS);
  const hasta = sumarHoras(datos.fecha, VENTANA_HORAS);
  const candidatas = await adapter.buscarCandidatas(datos.terminos, desde, hasta);

  return agruparCandidatas(candidatas, datos.fecha);
}

// V3.4 + V3.6: escribe la candidata elegida por Sebastian. Nunca se llama sola --
// siempre despues de que el humano confirmo en la UI cual de las candidatas es la
// correcta. La politica de que se pisa y que no (V3.6) vive en el core; esta funcion
// solo conecta las dependencias reales.
export async function confirmarGrabacionAction(idEmpresa: string, idToque: number, candidata: CandidataOFusion) {
  await requireSession();
  confirmarTranscript(idToque, candidata, {
    leerToque: leerToqueTranscript,
    escribirCompleto: escribirTranscriptCompleto,
    escribirSoloPuntero: escribirTranscriptSoloPuntero,
  });
  revalidatePath(`/llamada/${idEmpresa}`);
}

// Tarea 5b: solo PROPONE un borrador estructurado a partir del dictado (texto pegado,
// nunca audio). No escribe nada -- el owner corrige el borrador en CapturaLlamada y
// recien registrarToqueAction (submit del form) persiste.
export async function estructurarDictadoAction(dictado: string): Promise<ToqueEstructurado> {
  await requireSession();
  const ia = crearClaudeAdapter();
  return estructurarToque(dictado, ia);
}
