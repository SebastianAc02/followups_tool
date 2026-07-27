import type { ContadoresHoy } from "../db/repository";

// "Toques hoy" = contadores.total: cualquier toque EJECUTADO por el operador hoy, sin
// importar el resultado (no son cierres, ver el rename de 2026-07-27 abajo).
//
// Antes se llamaba contarCerradas y la tarjeta decia "Cerradas": las dos cosas eran falsas.
// No mide cierres (contadores.total suma TODO resultado, no solo los que cerraron), y hasta
// el 2026-07-27 tambien sumaba fuente='whatsapp_entrante' (las respuestas del ISP, no
// trabajo del operador). Caso real: un solo hilo de una sola empresa mando 42 mensajes en
// el dia y la tarjeta mostro 41 "cerradas" con cero toques reales del operador. El fix vive
// en contadoresHoy (repository.ts): `total` ya excluye los entrantes, esta funcion solo
// lee el campo correcto.
export function contarToquesHoy(contadores: ContadoresHoy): number {
  return contadores.total;
}
