"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  registrarToque,
  actualizarCampoCalificacion,
  terminosBusquedaTranscript,
  leerToqueTranscript,
  escribirTranscriptCompleto,
  escribirTranscriptSoloPuntero,
  marcarPasoInscripcionCompletadaManual,
} from "../../db/repository";
import { registrarToqueSchema } from "../../db/validation";
import type { CampoCalificacion } from "../../core/calificacion";
import { requireSession } from "../../lib/session";
import { crearGranolaAdapter } from "../../adapters/granola";
import { crearClaudeAdapter } from "../../adapters/claude";
import { agruparCandidatas, type CandidataOFusion } from "../../core/matcher";
import { confirmarTranscript } from "../../core/confirmarTranscript";
import { estructurarToque, type ToqueEstructurado } from "../../core/estructurar-toque";
import { aprobarDesdeInboxAction, type AprobarDesdeInboxResultado } from "../../por-revisar/actions";

export async function registrarToqueAction(formData: FormData) {
  const { idOrganizacion } = await requireSession();
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

  registrarToque(parsed, idOrganizacion);

  // Sesion 2026-07-09: si este toque cierra el paso activo de una cadencia (llamada
  // con paso_inscripcion pendiente), el paso se marca 'enviada' aca -- el toque YA
  // quedo guardado arriba con su resultado real, esto solo saca la fila de "Ir a
  // llamar" y le da al motor la fecha real para re-anclar el siguiente paso. No
  // aplica a un toque suelto (idPasoInscripcion viene vacio, no hay nada que cerrar).
  const idPasoInscripcionRaw = String(formData.get("idPasoInscripcion") ?? "").trim();
  if (idPasoInscripcionRaw) {
    marcarPasoInscripcionCompletadaManual(Number(idPasoInscripcionRaw), new Date().toISOString());
  }

  revalidatePath("/");
  revalidatePath("/cola");
  revalidatePath("/por-revisar");
  revalidatePath(`/llamada/${idEmpresa}`);
  redirect(`/llamada/${idEmpresa}?vista=confirmacion`);
}

// Edicion inline del checklist de calificacion: guarda un solo campo (usuarios/crm/
// pasarela) sin registrar un toque. Ver actualizarCampoCalificacion en el repository.
export async function actualizarCampoCalificacionAction(
  idEmpresa: string,
  campo: CampoCalificacion,
  valor: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { idOrganizacion } = await requireSession();
  try {
    actualizarCampoCalificacion(idEmpresa, campo, valor, idOrganizacion);
    revalidatePath(`/llamada/${idEmpresa}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar" };
  }
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

// Tarea 12 (rediseño UI de toque): EditorCorreo/EditorWhatsapp llaman esto para mandar el
// paso manual pendiente de HOY. Reusa aprobarDesdeInboxAction (app/por-revisar/actions.ts)
// tal cual -- misma regla de negocio (idempotente por el WHERE estado='pendiente' en
// aprobarPasoManual), sin duplicarla. La unica diferencia con el flujo de /por-revisar es
// A DONDE se navega despues: /por-revisar se queda en su bandeja (revalidatePath), el
// cockpit de toque redirige a la pantalla de Confirmacion de ESA empresa. Por eso esto no
// es un simple re-export: envuelve el resultado y decide el redirect aqui.
export async function enviarToqueCanalAction(
  idEmpresa: string,
  idPasoInscripcion: number,
  cuerpo?: string,
): Promise<AprobarDesdeInboxResultado | void> {
  const resultado = await aprobarDesdeInboxAction(idPasoInscripcion, cuerpo);
  if (!resultado.ok) return resultado;
  revalidatePath(`/llamada/${idEmpresa}`);
  redirect(`/llamada/${idEmpresa}?vista=confirmacion`);
}

// Tarea 12: correo/whatsapp SUELTO (sin inscripcion/cadencia activa -- no hay
// paso_inscripcion que aprobar). Reusa registrarToque tal cual CapturaLlamada, solo que
// con el canal del editor en vez de 'llamada'.
//
// Decision de diseño: registrarToqueSchema exige `resultado` (una de las 4 salidas
// cerradas del guion de LLAMADA: contesto_reunion/contesto_sigue_seguimiento/contesto_no/
// no_contesto). Un correo o whatsapp recien enviado no pasa por esas 4 salidas todavia --
// nadie ha respondido aun, no hubo conversacion que calificar. En vez de abrir el enum
// (cambio de dominio fuera de alcance de esta tarea) se usa 'no_contesto' como el valor
// mas honesto disponible: significa "sin respuesta todavia", que es exactamente el estado
// real de un mensaje que se acaba de mandar. Cuando el contacto responda, ESE es un toque
// nuevo con su propio resultado real (via CapturaLlamada u otro flujo), no una correccion
// de este.
export async function registrarToqueSueltoAction(idEmpresa: string, canal: "correo" | "whatsapp", cuerpo: string) {
  const { idOrganizacion } = await requireSession();
  const parsed = registrarToqueSchema.parse({
    idEmpresa,
    canal,
    resultado: "no_contesto",
    quePaso: cuerpo || undefined,
  });
  registrarToque(parsed, idOrganizacion);
  revalidatePath(`/llamada/${idEmpresa}`);
  redirect(`/llamada/${idEmpresa}?vista=confirmacion`);
}
