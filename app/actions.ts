"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { repartirFollowups, registrarToque, aprobarPasoManual } from "./db/repository";
import { plusDias } from "./lib/date-utils";
import { requireSession } from "./lib/session";

export async function repartirAction(formData: FormData) {
  // El owner viene de la sesion (V2.2): nadie reparte los follow-ups de otro.
  const { owner } = await requireSession();
  const porDia = Math.max(1, Math.round(Number(formData.get("porDia") ?? 10)) || 10);

  repartirFollowups(owner, porDia);

  revalidatePath("/");
  redirect("/");
}

// Tap de WhatsApp/correo desde la cola del día (F0.2): un mensaje que se manda sin saber
// todavía si van a contestar. resultado queda como 'no_contesto' (el más honesto de los 4
// valores del enum cerrado: no hay evidencia de respuesta todavía) y el próximo follow-up
// se calcula como mañana, mismo patrón que CaptureForm.tsx (plus(days)).
export async function registrarTapAction(formData: FormData) {
  await requireSession();
  const idEmpresa = String(formData.get("idEmpresa") ?? "");
  const canal = String(formData.get("canal") ?? "");
  if (!idEmpresa) return;
  if (canal !== "whatsapp" && canal !== "correo") return;

  const objecion = String(formData.get("objecion") ?? "").trim() || undefined;

  const proximoFollowUp = plusDias(1);

  registrarToque({ idEmpresa, canal, resultado: "no_contesto", proximoFollowUp, objecion });

  revalidatePath("/");
}

// V5.7: aprobar un paso manual (Tier 1) desde la cola unificada. fechaEnviada es AHORA
// (la fecha REAL, no la programada) -- es la que el motor de fechas usa para re-anclar
// el siguiente paso (B6, V5.6).
export async function aprobarPasoManualAction(formData: FormData) {
  await requireSession();
  const idPasoInscripcion = Number(formData.get("idPasoInscripcion"));
  if (!idPasoInscripcion) return;

  aprobarPasoManual(idPasoInscripcion, new Date().toISOString());

  revalidatePath("/cola");
}
