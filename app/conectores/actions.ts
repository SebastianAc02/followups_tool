"use server";

import { revalidatePath } from "next/cache";
import {
  guardarCredencialConector,
  agregarConfigConector,
  actualizarModoConector,
  quitarConfigConector,
  modoConector,
  leerCredencialConector,
  guardarConfiguracionAdmin,
} from "../db/repository";
import { requireSession } from "../lib/session";
import { conectorDelCatalogo, configuracionDelCatalogo, type ModoConector } from "./catalogo";
import { decidirGuardado, puedeRevelarCredencial } from "./politica";
import { ultimaNotaDe } from "../adapters/granola";
import { avisarAdminPorWhatsapp } from "../lib/alerta-admin";

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

// Guarda un ajuste de configuracion_admin (ej. buzon de Apollo). Solo admin. No es
// secreto (no pasa por cifrar/descifrar) -- por eso el resultado no necesita el mismo
// cuidado de "nunca devolver el valor" que guardarCredencialAction.
export async function guardarConfiguracionAction(
  _previo: ResultadoGuardado | null,
  formData: FormData,
): Promise<ResultadoGuardado> {
  const sesion = await requireSession();
  if (!sesion.admin) return { ok: false, error: "Solo un admin puede cambiar esta configuración." };

  const clave = String(formData.get("clave") ?? "").trim();
  const valor = String(formData.get("valor") ?? "").trim();
  if (!configuracionDelCatalogo(clave)) return { ok: false, error: "Ajuste no reconocido." };
  if (!valor) return { ok: false, error: "No tengo un valor: escribe algo antes de guardar." };

  guardarConfiguracionAdmin(clave, valor, sesion.id);
  revalidatePath("/conectores");
  return { ok: true };
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

export type ResultadoRevelar = { ok: true; credencial: string } | { ok: false; error: string };

// Bajo demanda: la pagina NUNCA trae el valor en el HTML inicial (page.tsx no llama
// leerCredencialConector). Solo esta accion, invocada por un clic explicito del
// admin, lo descifra y lo manda al cliente -- reduce la ventana de exposicion frente
// a mostrarlo siempre.
export async function revelarCredencialAction(proveedor: string): Promise<ResultadoRevelar> {
  const sesion = await requireSession();
  const modo = modoConector(proveedor);
  if (!modo) return { ok: false, error: "Este conector no está habilitado." };
  if (!puedeRevelarCredencial(modo, sesion.admin)) return { ok: false, error: "No podés revelar esta credencial." };

  const credencial = leerCredencialConector(proveedor);
  if (!credencial) return { ok: false, error: "No hay ninguna credencial guardada todavía." };
  return { ok: true, credencial };
}

export type ResultadoVerificacionGranola =
  | { ok: true; nota: { titulo: string | null; fecha: string; resumenCorto: string | null } }
  | { ok: false; error: "sin_llamadas" | "error_interno" };

// Guarda la credencial (personal, del usuario en sesion) y de una trae su ultima
// llamada real para que la confirme -- a diferencia de guardarCredencialAction (que
// solo guarda a ciegas), esto es lo que Sebastian pidio para Granola especificamente
// (2026-07-14): "estas es tu ultima llamada, este es el transcript correcto".
export async function verificarGranolaAction(credencial: string): Promise<ResultadoVerificacionGranola> {
  const sesion = await requireSession();
  const modo = modoConector("granola");
  if (modo !== "personal") return { ok: false, error: "error_interno" };
  guardarCredencialConector("granola", credencial, sesion.id);
  revalidatePath("/conectores");

  try {
    const nota = await ultimaNotaDe(sesion.id);
    if (!nota) return { ok: false, error: "sin_llamadas" };
    return { ok: true, nota: { titulo: nota.titulo, fecha: nota.fecha, resumenCorto: nota.resumenCorto } };
  } catch (e) {
    await avisarAdminPorWhatsapp(
      `${sesion.owner} intentó configurar Granola y tuvo un error: ${e instanceof Error ? e.message : String(e)}`,
    );
    return { ok: false, error: "error_interno" };
  }
}
