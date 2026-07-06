"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { crearCadencia } from "../db/repository";
import { parsearCadenciaCsv, parsearCadenciaMarkdown } from "../core/cadencia-parser";
import { requireSession } from "../lib/session";

// V4.7: sube la cadencia UNA vez (CSV o Markdown). El parser es puro; la validacion de
// dominio (canal cerrado, offsets) la hace crearCadencia con Zod. Cualquier error de
// parseo o validacion vuelve a la pantalla como ?error= (redirect va FUERA del try, si
// no atrapa el NEXT_REDIRECT que redirect() lanza internamente).
export async function importarCadenciaAction(formData: FormData) {
  await requireSession();
  const formato = String(formData.get("formato") ?? "md");
  const contenido = String(formData.get("contenido") ?? "").trim();
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!contenido) {
    redirect("/cadencias?error=" + encodeURIComponent("Pega el contenido de la cadencia"));
  }

  let idNueva: number | null = null;
  let errorMsg = "";
  try {
    const parseada =
      formato === "csv"
        ? parsearCadenciaCsv(contenido, { nombre: nombre || "Cadencia sin nombre" })
        : parsearCadenciaMarkdown(contenido);
    idNueva = crearCadencia(parseada);
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : "No se pudo leer la cadencia";
  }

  if (errorMsg) redirect("/cadencias?error=" + encodeURIComponent(errorMsg));
  revalidatePath("/cadencias");
  redirect("/cadencias?id=" + idNueva);
}
