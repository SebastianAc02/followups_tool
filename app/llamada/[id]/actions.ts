"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { registrarToque } from "../../db/repository";

export async function registrarToqueAction(formData: FormData) {
  const idEmpresa = String(formData.get("idEmpresa") ?? "");
  const resultado = String(formData.get("resultado") ?? "");
  if (!idEmpresa || !resultado) return;

  const quePaso = String(formData.get("quePaso") ?? "").trim() || undefined;
  const fecha = String(formData.get("fecha") ?? "").trim() || undefined;
  const proximoCanal = String(formData.get("canal") ?? "").trim() || undefined;
  const usuariosRaw = String(formData.get("usuarios") ?? "").trim();
  const usuarios = usuariosRaw ? Number(usuariosRaw) : undefined;
  const crm = String(formData.get("crm") ?? "").trim() || undefined;
  const pasarela = String(formData.get("pasarela") ?? "").trim() || undefined;

  registrarToque({ idEmpresa, resultado, quePaso, proximoFollowUp: fecha, proximoCanal, usuarios, crm, pasarela });

  revalidatePath("/");
  redirect("/");
}
