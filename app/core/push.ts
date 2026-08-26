// Push reanudable (B6, V5.4): mismo patron que app/core/outbox.ts, aplicado al envio
// de paso_inscripcion. Sin lote transaccional: cada destinatario+paso es independiente,
// uno que truena no bloquea a los demas ni los revierte. Idempotente por construccion:
// este push NUNCA crea filas de paso_inscripcion (eso lo hace quien materializa desde
// el motor de fechas, fuera de este archivo); solo avanza el estado de las que ya
// existen, y el indice unico id_destinatario+id_paso (V5.1) es quien de verdad
// garantiza que nunca hay dos filas para el mismo par.
import type { CanalEntrega, DestinatarioEnvio, PasoEnvio } from './ports/envio';
import { tienePlaceholderSinResolver } from './render-copy';

export type FilaPasoInscripcion = {
  idPasoInscripcion: number;
  proveedorCampanaId: string;
  destinatario: DestinatarioEnvio;
  paso: PasoEnvio;
  intentos: number;
  // Gmail Etapa 2 (2026-07-15): opcionales, solo poblados por
  // pasoInscripcionesPendientes('correo', ...) -- whatsapp/llamada no los necesitan.
  // Los usa registro-envio.ts (agruparPendientesCorreo) para resolver el adaptador de
  // CADA fila sin que push.ts tenga que saber que Gmail existe.
  owner?: string | null;
  idOrganizacion?: number;
  aprobadaEnvioGmail?: boolean;
};

export type PushDeps = {
  pendientes: () => FilaPasoInscripcion[];
  // enviando es informativo (no lo lee ninguna query de reintento): si el worker
  // muere justo entre marcarlo y recibir la respuesta de Apollo, la fila queda ahi
  // y no se reintenta sola -- mismo tipo de riesgo que ya acepta B7 (el worker no
  // promete exactly-once).
  marcarEnviando: (idPasoInscripcion: number) => void;
  // proveedor (sesion 2026-07-09): viene de EnvioResultado.proveedor, NO se asume --
  // asi el registro dice de verdad quien mando cada paso, sin importar si maniana
  // enviarPaso lo resuelve un adaptador de Apollo, de WhatsApp o de otro proveedor.
  // proveedorHiloId (2026-07-28): el hilo de Gmail de este envio. enviarPaso lo devolvia
  // desde el 2026-07-14 y este push lo tiraba a la basura, con lo cual el poll de tracking
  // se quedaba sin la unica referencia por la que Gmail se deja leer. undefined para Apollo
  // y WhatsApp, que no tienen hilo.
  marcarEnviada: (idPasoInscripcion: number, proveedor: string, proveedorMensajeId: string, fechaEnviada: string, proveedorHiloId?: string) => void;
  marcarFallo: (idPasoInscripcion: number, intentos: number, proximoIntento: string | null) => void;
};

// Mismos escalones que outbox (V3.7): consistencia de comportamiento entre los dos
// mecanismos de reintento del worker, no hay razon de negocio para que Apollo
// reintente distinto de Notion.
const ESCALONES_MINUTOS = [1, 5, 30, 120, 720];
export const MAX_INTENTOS = ESCALONES_MINUTOS.length;

export function calcularProximoIntentoPush(intentos: number, ahora: Date): Date {
  const minutos = ESCALONES_MINUTOS[Math.min(intentos - 1, ESCALONES_MINUTOS.length - 1)];
  return new Date(ahora.getTime() + minutos * 60_000);
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// throttleMs acepta una FUNCION ademas de un numero (2026-07-16): WhatsApp necesita jitter
// (45-90s aleatorio, ver core/ventana-envio.ts) porque un intervalo fijo es tan patron de
// bot como no tener ninguno. Gmail sigue pasando un numero fijo, sin cambios.
export async function pushPendientes(
  deps: PushDeps,
  envio: CanalEntrega,
  ahora: Date = new Date(),
  throttleMs: number | (() => number) = 0,
): Promise<void> {
  const esperaDe = () => (typeof throttleMs === 'function' ? throttleMs() : throttleMs);
  let primero = true;
  for (const fila of deps.pendientes()) {
    if (!primero) {
      const ms = esperaDe();
      if (ms > 0) await esperar(ms);
    }
    primero = false;
    // Red de seguridad final (incidente ConmuTV, 2026-08-25): sin importar qué falló arriba
    // (el fallback de nombre, el render por canal, algo nuevo mañana), esto es lo último que
    // corre antes de tocar al proveedor real. Bloquea SOLO esta fila -- no apaga el ciclo ni
    // tumba las demás -- y NO aplica ningún fallback silencioso: si el fallback de arriba
    // tenía un bug, taparlo acá otra vez lo esconde para siempre. Se marca 'fallo' agotado
    // (MAX_INTENTOS de una) porque reintentar un texto roto no lo arregla solo; alguien tiene
    // que corregir la versión del paso y volver a materializar.
    const placeholderEnCuerpo = tienePlaceholderSinResolver(fila.paso.cuerpo);
    const placeholderEnAsunto = fila.paso.asunto != null && tienePlaceholderSinResolver(fila.paso.asunto);
    if (placeholderEnCuerpo || placeholderEnAsunto) {
      console.error(
        `push bloqueó paso_inscripcion ${fila.idPasoInscripcion} (canal ${fila.paso.canal}): quedó un placeholder ` +
          `[variable] sin resolver en ${placeholderEnCuerpo ? 'el cuerpo' : ''}${placeholderEnCuerpo && placeholderEnAsunto ? ' y ' : ''}` +
          `${placeholderEnAsunto ? 'el asunto' : ''}. NO se manda: revisar la versión del paso y volver a materializar.`,
      );
      deps.marcarFallo(fila.idPasoInscripcion, MAX_INTENTOS, null);
      continue;
    }
    try {
      deps.marcarEnviando(fila.idPasoInscripcion);
      const resultado = await envio.enviarPaso(fila.proveedorCampanaId, fila.destinatario, fila.paso);
      deps.marcarEnviada(fila.idPasoInscripcion, resultado.proveedor, resultado.proveedorMensajeId, ahora.toISOString(), resultado.proveedorHiloId);
    } catch (e) {
      // Sesion 2026-07-10: el catch se tragaba el error sin loguearlo -- una fila
      // fallaba 3 veces en silencio (APOLLO_MAILBOX_ID sin cargar, credencial mala,
      // Apollo caido) y lo unico visible era 'fallo' en la DB, sin pista de por que.
      // console.error, no lanzar: un item roto no debe tumbar el ciclo del worker.
      console.error(`push falló para paso_inscripcion ${fila.idPasoInscripcion}:`, e instanceof Error ? e.message : e);
      const intentos = fila.intentos + 1;
      const agotado = intentos >= MAX_INTENTOS;
      deps.marcarFallo(
        fila.idPasoInscripcion,
        intentos,
        agotado ? null : calcularProximoIntentoPush(intentos, ahora).toISOString(),
      );
    }
  }
}
