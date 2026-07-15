// Push reanudable (B6, V5.4): mismo patron que app/core/outbox.ts, aplicado al envio
// de paso_inscripcion. Sin lote transaccional: cada destinatario+paso es independiente,
// uno que truena no bloquea a los demas ni los revierte. Idempotente por construccion:
// este push NUNCA crea filas de paso_inscripcion (eso lo hace quien materializa desde
// el motor de fechas, fuera de este archivo); solo avanza el estado de las que ya
// existen, y el indice unico id_destinatario+id_paso (V5.1) es quien de verdad
// garantiza que nunca hay dos filas para el mismo par.
import type { CanalEntrega, DestinatarioEnvio, PasoEnvio } from './ports/envio';

export type FilaPasoInscripcion = {
  idPasoInscripcion: number;
  proveedorCampanaId: string;
  destinatario: DestinatarioEnvio;
  paso: PasoEnvio;
  intentos: number;
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
  marcarEnviada: (idPasoInscripcion: number, proveedor: string, proveedorMensajeId: string, fechaEnviada: string) => void;
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

export async function pushPendientes(deps: PushDeps, envio: CanalEntrega, ahora: Date = new Date(), throttleMs: number = 0): Promise<void> {
  let primero = true;
  for (const fila of deps.pendientes()) {
    if (!primero && throttleMs > 0) await esperar(throttleMs);
    primero = false;
    try {
      deps.marcarEnviando(fila.idPasoInscripcion);
      const resultado = await envio.enviarPaso(fila.proveedorCampanaId, fila.destinatario, fila.paso);
      deps.marcarEnviada(fila.idPasoInscripcion, resultado.proveedor, resultado.proveedorMensajeId, ahora.toISOString());
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
