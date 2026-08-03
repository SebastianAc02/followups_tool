"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { repartirFollowups, registrarToque, aprobarPasoManual, aprobarYProgramarPaso } from "./db/repository";
import { plusDias } from "./lib/date-utils";
import { requireSession, requireEscritura } from "./lib/session";
import { calcularHorarioEscalonado, instanteBogota, ESPACIADO_ENVIOS_DEFAULT_MIN } from "./core/horario-escalonado";
import { hoy } from "./lib/reloj";

export async function repartirAction(formData: FormData) {
  // El owner viene de la sesion (V2.2): nadie reparte los follow-ups de otro.
  const { owner, idOrganizacion } = await requireSession();
  const porDia = Math.max(1, Math.round(Number(formData.get("porDia") ?? 10)) || 10);

  repartirFollowups(owner, porDia, idOrganizacion);

  revalidatePath("/");
  redirect("/");
}

// Tap de WhatsApp/correo desde la cola del día (F0.2): un mensaje que se manda sin saber
// todavía si van a contestar. resultado queda como 'no_contesto' (el más honesto de los 4
// valores del enum cerrado: no hay evidencia de respuesta todavía) y el próximo follow-up
// se calcula como mañana, mismo patrón que CaptureForm.tsx (plus(days)).
export async function registrarTapAction(formData: FormData) {
  const { idOrganizacion } = await requireSession();
  const idEmpresa = String(formData.get("idEmpresa") ?? "");
  const canal = String(formData.get("canal") ?? "");
  if (!idEmpresa) return;
  if (canal !== "whatsapp" && canal !== "correo") return;

  // objecion pasa a vocabulario cerrado (2026-07-25), y este tap no tiene de donde sacar el
  // valor acotado: lo que venga del form es prosa. Entra como objecionNota, que es justo para
  // eso, y el campo contable queda vacio en vez de forzado a una categoria inventada.
  const objecionNota = String(formData.get("objecion") ?? "").trim() || undefined;

  const proximoFollowUp = plusDias(1);

  registrarToque({ idEmpresa, canal, resultado: "no_contesto", proximoFollowUp, objecionNota }, idOrganizacion);

  revalidatePath("/");
}

// V5.7: aprobar un paso manual (Tier 1) desde la cola unificada. fechaEnviada es AHORA
// (la fecha REAL, no la programada) -- es la que el motor de fechas usa para re-anclar
// el siguiente paso (B6, V5.6).
// Parte 4 campanas: cuerpoFinal es el texto (personalizado o tal cual) que Sebastian
// mando el mismo; queda como toque en el historial de la empresa.
export async function aprobarPasoManualAction(formData: FormData) {
  await requireSession();
  const idPasoInscripcion = Number(formData.get("idPasoInscripcion"));
  if (!Number.isFinite(idPasoInscripcion) || idPasoInscripcion <= 0) return;
  const cuerpoFinal = String(formData.get("cuerpoFinal") ?? "").trim() || undefined;

  aprobarPasoManual(idPasoInscripcion, new Date().toISOString(), cuerpoFinal);

  revalidatePath("/cola");
}

// APROBAR PARA QUE SALGA. La otra mitad, la que faltaba en la web (2026-08-03).
//
// Son dos gestos distintos y hasta hoy la web solo tenia uno:
//   - aprobarPasoManualAction (arriba): "ya lo mande yo por fuera". Marca el paso 'enviada' y
//     escribe el toque. No manda nada, porque ya salio.
//   - esta: "el texto es este, mandalo tu a las 11". Deja el copy revisado y aprobado_en, el
//     paso sigue pendiente y lo empuja el worker cuando llega la hora. No escribe toque:
//     todavia no ha pasado nada que contar.
//
// Sin esta accion, WhatsApp no sale por la web y menos en modo prueba: el gate de revision
// humana de pasoInscripcionesPendientes exige aprobado_en para TODO paso de whatsapp (manual o
// automatico), y el unico camino que lo llenaba era aprobarYProgramarPaso, que vivia solo en el
// MCP -- y el MCP corre siempre contra isps.db.
//
// PROGRAMA, NO MANDA, y las horas son un PISO de elegibilidad: el worker corre cada 5 minutos y
// separa los de una misma pasada con su propio espaciado. Se dice en la respuesta para que el
// que programa a las 11:00 no espere el segundero.
export type ProgramarEnviosResultado =
  | { ok: true; programados: number; rechazados: { idPasoInscripcion: number; motivo: string }[]; horaInicio: string }
  | { ok: false; error: string };

export async function aprobarYProgramarAction(input: {
  pasos: { idPasoInscripcion: number; cuerpo: string }[];
  // Hora de Bogota, "HH:MM". El dia es el de hoy (con el reloj de demo, si esta corrido).
  hora: string;
  espaciadoMinutos?: number;
}): Promise<ProgramarEnviosResultado> {
  // requireEscritura y no requireSession: un visitante no programa envios. El Proxy del db ya
  // lo frenaria al escribir, pero el gate explicito falla antes y con un mensaje que se entiende.
  const { owner } = await requireEscritura();

  const pasos = input.pasos.filter((p) => Number.isFinite(p.idPasoInscripcion) && p.idPasoInscripcion > 0);
  if (pasos.length === 0) return { ok: false, error: "No hay pasos que programar" };
  const vacio = pasos.find((p) => p.cuerpo.trim() === "");
  // Aprobar es haber leido el texto: aprobar uno vacio seria dejar salir un mensaje en blanco.
  if (vacio) return { ok: false, error: "Hay un mensaje sin texto: revisa el copy antes de aprobarlo" };

  try {
    const espaciadoMinutos = input.espaciadoMinutos ?? ESPACIADO_ENVIOS_DEFAULT_MIN;
    const horaInicio = instanteBogota(hoy(), input.hora);
    const horario = calcularHorarioEscalonado(horaInicio, pasos.length, espaciadoMinutos * 60_000);

    const rechazados: { idPasoInscripcion: number; motivo: string }[] = [];
    let programados = 0;
    // Uno por uno y sin transaccion que los envuelva: un paso que ya salio no puede tumbar los
    // otros seis. Mismo criterio que el lote del MCP.
    pasos.forEach((paso, i) => {
      const r = aprobarYProgramarPaso(paso.idPasoInscripcion, paso.cuerpo, horario[i].fechaProgramada, owner);
      if (r.ok) programados += 1;
      else rechazados.push({ idPasoInscripcion: r.idPasoInscripcion, motivo: r.motivo });
    });

    revalidatePath("/cola");
    return { ok: true, programados, rechazados, horaInicio };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo programar el envío" };
  }
}

// Parte 4 campanas: aprobar TODO un grupo batch de una (mismo paso, mismo dia, N
// empresas) con el mismo cuerpoFinal para todas. Reusa aprobarPasoManual por cada
// id; cada llamada ya es su propia transaccion, no hace falta envolver otra vez.
export async function aprobarLoteManualAction(formData: FormData) {
  await requireSession();
  const ids = formData.getAll("idPasoInscripcion").map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) return;
  const cuerpoFinal = String(formData.get("cuerpoFinal") ?? "").trim() || undefined;

  const ahora = new Date().toISOString();
  for (const id of ids) {
    aprobarPasoManual(id, ahora, cuerpoFinal);
  }

  revalidatePath("/cola");
}
