"use server";

import { revalidatePath } from "next/cache";
import { crearEvolutionAdapter } from "../adapters/evolution";
import {
  crearLineaWhatsapp,
  actualizarEstadoLineaWhatsapp,
  lineaWhatsappPorId,
  lineasWhatsappDeUsuario,
  mensajeWhatsappMasRecienteDesde,
} from "../db/repository";
import { requireSession } from "../lib/session";
import { conEscritura } from "../lib/read-only";

// Tarea 8 (D6): server actions de la seccion "Lineas de WhatsApp" en /conectores. Cada
// usuario conecta y prueba SU propia linea; no necesita (ni ve) la credencial admin del
// conector -- esa sigue siendo cosa aparte (el API key del SERVIDOR Evolution completo).

export type ResultadoConexion = { ok: true; pairingCode: string } | { ok: false; error: string };

// Idempotente a proposito (mismo criterio que iniciarConexion en el puerto): si el
// usuario ya tiene una linea sin aparear y vuelve a pedir codigo, Evolution regenera el
// pairing-code para la MISMA instancia en vez de crear una fila nueva.
export async function agregarLineaAction(
  _previo: ResultadoConexion | null,
  formData: FormData,
): Promise<ResultadoConexion> {
  const sesion = await requireSession();
  const numero = String(formData.get("numero") ?? "").replace(/\D/g, "");
  if (!numero) return { ok: false, error: "Falta el número (solo dígitos, con código de país)." };

  // Match por (usuario, numero), no "la primera linea del usuario": un usuario puede
  // tener mas de una linea (pedido de Sebastian, 2026-07-11 -- conectar varios numeros
  // a una sola cuenta). Solo se reusa la fila si el numero YA es exactamente el mismo
  // (reintento de un apareo que quedo a medias); un numero distinto crea una linea nueva.
  const existente = lineasWhatsappDeUsuario(sesion.id).find((l) => l.numero === numero);
  const referenciaProveedor = existente?.referenciaProveedor ?? `wa-${numero}`;

  try {
    const adapter = crearEvolutionAdapter();
    const inicio = await adapter.iniciarConexion(referenciaProveedor, numero);
    if (inicio.tipo !== "codigo") return { ok: false, error: "Evolution no devolvió un código de apareo." };

    if (!existente) {
      // techoDiario personal = 10 (default del plan D6: 25 pool, 10 personal).
      // conEscritura: un visitante (solo lectura) SI puede conectar una linea de prueba
      // (decision 2026-07-14); levanta el candado del db solo para esta escritura.
      conEscritura(() =>
        crearLineaWhatsapp({ numero, tipo: "personal", idUsuario: sesion.id, referenciaProveedor, techoDiario: 10 }),
      );
    }
    revalidatePath("/conectores");
    return { ok: true, pairingCode: inicio.data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error conectando con Evolution." };
  }
}

function puedeTocarLinea(idUsuario: string | null, sesion: { id: string; admin: boolean }): boolean {
  if (idUsuario === null) return sesion.admin; // linea de pool: solo admin
  return idUsuario === sesion.id || sesion.admin;
}

// Mismo contrato que ResultadoConexion/ResultadoPrueba: un error de Evolution vuelve
// como DATO para que la UI lo pinte, nunca como excepcion suelta. Sin esto, un tropiezo
// del proveedor sube hasta Next y mata la pagina entera -- pasado real: un 404 de
// /instance/logout dejo /conectores en "This page couldn't load" (2026-07-15, VPS).
export type ResultadoAccion = { ok: true } | { ok: false; error: string };

// Verifica el estado real contra Evolution (no el guardado en la fila) y lo persiste.
// Quien llama decide cuando (boton "Ya vinculé, verificar" mientras aparea, refresco
// manual despues) -- no hay polling automatico en v1.
export async function verificarEstadoLineaAction(
  _previo: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const sesion = await requireSession();
  const id = Number(formData.get("id"));
  const linea = lineaWhatsappPorId(id);
  if (!linea || !linea.referenciaProveedor || !puedeTocarLinea(linea.idUsuario, sesion)) {
    return { ok: false, error: "No podés tocar esta línea." };
  }

  try {
    const adapter = crearEvolutionAdapter();
    const estado = await adapter.estadoConexion(linea.referenciaProveedor);
    conEscritura(() => actualizarEstadoLineaWhatsapp(id, estado));
    revalidatePath("/conectores");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error consultando el estado en Evolution." };
  }
}

export async function desconectarLineaAction(
  _previo: ResultadoAccion | null,
  formData: FormData,
): Promise<ResultadoAccion> {
  const sesion = await requireSession();
  const id = Number(formData.get("id"));
  const linea = lineaWhatsappPorId(id);
  if (!linea || !linea.referenciaProveedor || !puedeTocarLinea(linea.idUsuario, sesion)) {
    return { ok: false, error: "No podés tocar esta línea." };
  }

  try {
    const adapter = crearEvolutionAdapter();
    await adapter.desconectar(linea.referenciaProveedor);
    // Solo se marca 'caida' si Evolution confirmo el cierre: si la llamada trueno, no
    // sabemos en que estado quedo la linea y mentir en la fila es peor que no tocarla.
    conEscritura(() => actualizarEstadoLineaWhatsapp(id, "caida"));
    revalidatePath("/conectores");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error desconectando en Evolution." };
  }
}

export type ResultadoPrueba = { ok: true; mensajeId: string } | { ok: false; error: string };

// Envio de prueba: llama al adaptador DIRECTO (enviarPaso), sin pasar por goteo/outbox --
// es una verificacion manual de conectividad ("¿mi linea manda de verdad?"), no un paso
// de campana real. Por eso no cuenta contra techo_diario ni deja rastro en toque/paso_
// inscripcion; el unico registro es la respuesta que ve quien lo pidio.
export async function probarLineaAction(
  _previo: ResultadoPrueba | null,
  formData: FormData,
): Promise<ResultadoPrueba> {
  const sesion = await requireSession();
  const id = Number(formData.get("id"));
  const destino = String(formData.get("destino") ?? "").replace(/\D/g, "");
  if (!destino) return { ok: false, error: "Falta el número de destino." };

  const linea = lineaWhatsappPorId(id);
  if (!linea || !linea.referenciaProveedor || !puedeTocarLinea(linea.idUsuario, sesion)) {
    return { ok: false, error: "No podés probar esta línea." };
  }

  try {
    const adapter = crearEvolutionAdapter();
    const resultado = await adapter.enviarPaso(
      linea.referenciaProveedor,
      { telefono: destino, email: null, nombre: null, empresa: null, cargo: null },
      {
        asunto: null,
        cuerpo: "Prueba de conexión de WhatsApp. Si ves este mensaje, tu línea manda mensajes.",
        canal: "whatsapp",
      },
    );
    return { ok: true, mensajeId: resultado.proveedorMensajeId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error enviando el mensaje de prueba." };
  }
}

export type ResultadoRecepcion =
  | { ok: true; recibido: true; telefono: string; texto: string; nombreContacto: string | null }
  | { ok: true; recibido: false }
  | { ok: false; error: string };

// Paso "recibir" del dialogo de prueba: no hay push del servidor hacia la UI, asi que
// esto es polling manual (boton "Ya me escribió, verificar") contra mensaje_whatsapp,
// que el webhook llena de forma independiente. `desde` es el momento en que se abrio
// el dialogo (lo manda el cliente) para no confundir un mensaje viejo con la prueba
// en curso. Ojo: esto solo encuentra algo una vez el webhook de Evolution este
// apuntando de verdad a esta tool (ver checklist de deploy en memoria/plan) -- en
// local contra webhook.site no va a llegar nada.
export async function verificarMensajeRecibidoAction(
  _previo: ResultadoRecepcion | null,
  formData: FormData,
): Promise<ResultadoRecepcion> {
  const sesion = await requireSession();
  const id = Number(formData.get("id"));
  const desde = String(formData.get("desde") ?? "");
  const linea = lineaWhatsappPorId(id);
  if (!linea || !linea.referenciaProveedor || !puedeTocarLinea(linea.idUsuario, sesion)) {
    return { ok: false, error: "No podés verificar esta línea." };
  }

  const mensaje = mensajeWhatsappMasRecienteDesde(linea.referenciaProveedor, desde);
  if (!mensaje || !mensaje.telefono || !mensaje.texto) return { ok: true, recibido: false };
  return { ok: true, recibido: true, telefono: mensaje.telefono, texto: mensaje.texto, nombreContacto: mensaje.nombreContacto };
}
