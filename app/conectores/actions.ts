"use server";

import { revalidatePath } from "next/cache";
import {
  guardarCredencialConector,
  agregarConfigConector,
  actualizarModoConector,
  quitarConfigConector,
  modoConector,
} from "../db/repository";
import { requireSession } from "../lib/session";
import { conectorDelCatalogo, type ModoConector } from "./catalogo";
import { decidirGuardado } from "./politica";

function modoValido(v: string): v is ModoConector {
  return v === "personal" || v === "admin";
}

// Resultado de guardarCredencialAction: para useActionState en el cliente. `null` es el
// estado inicial (sin intento todavia); ok=false trae el motivo, para que el form muestre
// el error en vez de fallar en silencio (ej. boton "Guardar" sin haber pegado nada).
export type ResultadoGuardado = { ok: true } | { ok: false; error: string };

// Guarda la credencial de un conector. El modo (personal/admin) lo decide la config
// server-side, nunca el formulario. La autoridad la resuelve decidirGuardado: personal =
// fila del usuario; admin = fila global, solo admin.
export async function guardarCredencialAction(
  _previo: ResultadoGuardado | null,
  formData: FormData,
): Promise<ResultadoGuardado> {
  const sesion = await requireSession();
  const proveedor = String(formData.get("proveedor") ?? "").trim();
  const credencial = String(formData.get("credencial") ?? "").trim();
  if (!conectorDelCatalogo(proveedor)) return { ok: false, error: "Conector no reconocido." };
  if (!credencial) return { ok: false, error: "No tengo credencial: pega un valor antes de guardar." };

  const modo = modoConector(proveedor);
  if (!modo) return { ok: false, error: "Este conector no está habilitado." };

  const decision = decidirGuardado(modo, sesion.admin);
  if (!decision.permitido) return { ok: false, error: "Solo un admin puede configurar esta conexión." };

  if (decision.scope === "global") {
    guardarCredencialConector(proveedor, credencial);
  } else {
    guardarCredencialConector(proveedor, credencial, sesion.id);
  }
  revalidatePath("/conectores");
  return { ok: true };
}

// Agrega un conector desde el catalogo. Solo admin. El modo lo escoge el admin libremente.
export async function agregarConectorAction(formData: FormData) {
  const sesion = await requireSession();
  if (!sesion.admin) return;

  const proveedor = String(formData.get("proveedor") ?? "").trim();
  const modo = String(formData.get("modo") ?? "").trim();
  if (!conectorDelCatalogo(proveedor) || !modoValido(modo)) return;

  agregarConfigConector(proveedor, modo, sesion.id);
  revalidatePath("/conectores");
}

// Cambia el modo de un conector ya agregado. Solo admin. Las credenciales del otro modo
// quedan dormidas, no se borran.
export async function cambiarModoAction(formData: FormData) {
  const sesion = await requireSession();
  if (!sesion.admin) return;

  const proveedor = String(formData.get("proveedor") ?? "").trim();
  const modo = String(formData.get("modo") ?? "").trim();
  if (!conectorDelCatalogo(proveedor) || !modoValido(modo)) return;

  actualizarModoConector(proveedor, modo);
  revalidatePath("/conectores");
}

// Quita (duerme) un conector. Solo admin. No borra credenciales: re-agregar lo revive.
export async function quitarConectorAction(formData: FormData) {
  const sesion = await requireSession();
  if (!sesion.admin) return;

  const proveedor = String(formData.get("proveedor") ?? "").trim();
  if (!conectorDelCatalogo(proveedor)) return;

  quitarConfigConector(proveedor);
  revalidatePath("/conectores");
}
