"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { repartirFollowups, registrarToque } from "./db/repository";
import { plusDias } from "./lib/date-utils";

export async function repartirAction(formData: FormData) {
  const owner = String(formData.get("owner") ?? "");
  const porDia = Math.max(1, Math.round(Number(formData.get("porDia") ?? 10)) || 10);
  if (!owner) return;

  repartirFollowups(owner, porDia);

  revalidatePath("/");
  redirect(`/?owner=${encodeURIComponent(owner)}`);
}

// Tap de WhatsApp/correo desde la cola del día (F0.2): un mensaje que se manda sin saber
// todavía si van a contestar. resultado queda como 'no_contesto' (el más honesto de los 4
// valores del enum cerrado: no hay evidencia de respuesta todavía) y el próximo follow-up
// se calcula como mañana, mismo patrón que CaptureForm.tsx (plus(days)).
export async function registrarTapAction(formData: FormData) {
  const idEmpresa = String(formData.get("idEmpresa") ?? "");
  const canal = String(formData.get("canal") ?? "");
  if (!idEmpresa) return;
  if (canal !== "whatsapp" && canal !== "correo") return;

  const objecion = String(formData.get("objecion") ?? "").trim() || undefined;

  const proximoFollowUp = plusDias(1);

  registrarToque({ idEmpresa, canal, resultado: "no_contesto", proximoFollowUp, objecion });

  revalidatePath("/");
}
