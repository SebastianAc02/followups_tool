"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { registrarToque } from "../../db/repository";
import { registrarToqueSchema } from "../../db/validation";

export async function registrarToqueAction(formData: FormData) {
  const idEmpresa = String(formData.get("idEmpresa") ?? "");
  const resultado = String(formData.get("resultado") ?? "");
  if (!idEmpresa || !resultado) return;

  // Canal REAL de este toque. El formulario actual (CaptureForm, V1.1) todavía no tiene un
  // selector propio para esto -> puente temporal a 'llamada' hasta V1.3, que sí lo agrega.
  const canal = String(formData.get("toqueCanal") ?? "llamada").trim() || "llamada";

  const quePaso = String(formData.get("quePaso") ?? "").trim() || undefined;
  const fecha = String(formData.get("fecha") ?? "").trim() || undefined;
  const proximoCanal = String(formData.get("canal") ?? "").trim() || undefined;
  const usuariosRaw = String(formData.get("usuarios") ?? "").trim();
  const usuarios = usuariosRaw ? Number(usuariosRaw) : undefined;
  const crm = String(formData.get("crm") ?? "").trim() || undefined;
  const pasarela = String(formData.get("pasarela") ?? "").trim() || undefined;

  // Campos de V1.3 (razón de pérdida, objeción, KDM): el formulario actual no los manda
  // todavía, pero si llegan (formularios futuros o pruebas manuales) se leen aquí.
  let razonPerdida = String(formData.get("razonPerdida") ?? "").trim() || undefined;
  const objecion = String(formData.get("objecion") ?? "").trim() || undefined;

  // Puente temporal V1.1->V1.3: CaptureForm hoy solo tiene 2 salidas y mapea "Contestó" a
  // contesto_no (el enum cerrado exige razonPerdida ahi). Sin campo de razón en la UI
  // todavia, se usa un placeholder explicito para no romper la demo basica. V1.3 agrega el
  // campo real y este placeholder deja de generarse.
  if (resultado === "contesto_no" && !razonPerdida) {
    razonPerdida = "Sin especificar (pendiente UI V1.3)";
  }
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
