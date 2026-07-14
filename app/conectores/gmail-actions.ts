"use server";

import { revalidatePath } from "next/cache";
import { registrarHeartbeatConector } from "../db/repository";
import { mandarCorreoDePrueba, emailGmailConectado } from "../adapters/gmail";
import { requireSession } from "../lib/session";

// Confirmacion manual (Etapa 1, paso 3 del design doc): el usuario dice "si, me llego"
// despues de revisar su bandeja -- mismo criterio de Pieza B (spec conectores-apollo-
// granola-design.md): solo la confirmacion explicita marca el conector como verdadero-
// Configurado. registrarHeartbeatConector(...,'ok',...) hace que vistaEstado (estado-ui.ts)
// pase de "Configurado" (amber, pendiente) a "Vivo" (verde) -- reusa infra existente, sin
// estado nuevo en el schema.
export async function confirmarVerificacionGmailAction(_formData: FormData): Promise<void> {
  const sesion = await requireSession();
  registrarHeartbeatConector('gmail', 'ok', sesion.id);
  revalidatePath('/conectores');
}

export type ResultadoReenvioGmail = { ok: true } | { ok: false; error: string };

// Reenvia el correo de prueba si el primero no llego (spam, cuota, lo que sea) sin que el
// usuario tenga que desconectar y reconectar todo el flujo OAuth.
export async function reenviarPruebaGmailAction(
  _previo: ResultadoReenvioGmail | null,
  _formData: FormData,
): Promise<ResultadoReenvioGmail> {
  const sesion = await requireSession();
  const email = emailGmailConectado(sesion.id);
  if (!email) return { ok: false, error: 'No hay Gmail conectado.' };

  try {
    await mandarCorreoDePrueba(sesion.id, email);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error mandando el correo de prueba.' };
  }
}
