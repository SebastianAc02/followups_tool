"use server";

import { revalidatePath } from "next/cache";
import { guardarCredencialConector } from "../db/repository";
import { requireSession } from "../lib/session";

// V3.8: Granola es credencial PERSONAL (V3.1b), cualquier usuario en sesion guarda
// la suya, con su propio id, sin pisar la de otro.
export async function guardarGranolaAction(formData: FormData) {
  const sesion = await requireSession();
  const credencial = String(formData.get("credencial") ?? "").trim();
  if (!credencial) return;

  guardarCredencialConector("granola", credencial, sesion.id);
  revalidatePath("/conectores");
}

// V3.8: Notion es credencial GLOBAL (un solo CRM para todos), solo admin la edita.
// Sin admin=true, la accion no escribe nada (defensa en profundidad: la UI ya oculta
// el formulario para no-admin, esto es la garantia real).
export async function guardarNotionAction(formData: FormData) {
  const sesion = await requireSession();
  if (!sesion.admin) return;

  const credencial = String(formData.get("credencial") ?? "").trim();
  if (!credencial) return;

  guardarCredencialConector("notion", credencial);
  revalidatePath("/conectores");
}
