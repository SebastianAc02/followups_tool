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

// Guarda la credencial de un conector. El modo (personal/admin) lo decide la config
// server-side, nunca el formulario. La autoridad la resuelve decidirGuardado: personal =
// fila del usuario; admin = fila global, solo admin.
export async function guardarCredencialAction(formData: FormData) {
  const sesion = await requireSession();
  const proveedor = String(formData.get("proveedor") ?? "").trim();
  const credencial = String(formData.get("credencial") ?? "").trim();
  if (!credencial || !conectorDelCatalogo(proveedor)) return;

  const modo = modoConector(proveedor);
  if (!modo) return; // no habilitado

  const decision = decidirGuardado(modo, sesion.admin);
  if (!decision.permitido) return;

  if (decision.scope === "global") {
    guardarCredencialConector(proveedor, credencial);
  } else {
    guardarCredencialConector(proveedor, credencial, sesion.id);
  }
  revalidatePath("/conectores");
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
