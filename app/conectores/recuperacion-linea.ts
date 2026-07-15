// Modulo aparte (no "use server", sin next/cache) a proposito: node --test no resuelve
// imports de Next dentro de un archivo de server actions, y esta es logica de decision
// pura -- no necesita ser una action en si misma. lineas-whatsapp-actions.ts la importa.
import { ErrorEvolution } from "../adapters/evolution";
import { actualizarEstadoLineaWhatsapp } from "../db/repository";
import { conEscritura } from "../lib/read-only";

// Un error de Evolution al tocar una linea puede significar dos cosas MUY distintas:
//   - "la instancia no existe" (404): informacion definitiva, la linea murio.
//   - cualquier otra cosa (500, timeout, o ni siquiera un ErrorEvolution): ambiguo, no
//     sabemos en que estado quedo -- mentir escribiendo algo es peor que no tocarla (ver
//     el comentario original de desconectarLineaAction, en lineas-whatsapp-actions.ts).
// Devuelve true si el error era del primer tipo y la fila ya se corrigio; false si el
// error era ambiguo y la fila quedo intacta a proposito.
export function marcarCaidaSiNoExiste(id: number, e: unknown): boolean {
  // TODO(Sebastián): 3-4 líneas.
  //
  // Pista: `e instanceof ErrorEvolution && e.instanciaNoExiste`, y la escritura va con
  // conEscritura(() => actualizarEstadoLineaWhatsapp(id, 'caida')) -- el candado de
  // solo-lectura, mismo patron que las demas escrituras de este archivo.
  return false;
}
