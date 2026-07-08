import type { EnvioAdapter } from '../core/ports/envio';
import type { Canal } from '../db/validation';
import { CANALES_AUTOMATICOS } from '../db/validation';
import { crearApolloAdapter } from './apollo';

// Registro canal -> proveedor real (sesion 2026-07-09, pedido explicito de Sebastian:
// SOLID, cada canal cambia de proveedor sin tocar el core). Este es el UNICO lugar del
// proyecto que decide "que proveedor manda este canal" -- push.ts y tracking.ts nunca
// conocen Apollo por nombre, reciben el EnvioAdapter ya resuelto.
//
// correo -> Apollo (el unico proveedor automatico que existe hoy).
// llamada -> null A PROPOSITO: no es una limitacion temporal, es la decision de
//   Sebastian de que el sea el "proveedor" de llamada. Un paso de canal=llamada
//   nunca deberia ser automatico (ver CANALES_AUTOMATICOS en db/validation.ts) --
//   siempre espera revision humana en /cola (aprobarPasoManual), que ya es esa via.
// whatsapp -> null hasta que se conecte un proveedor real. Prender whatsapp automatico
//   el dia de manana es agregar una linea aca (crearWhatsAppAdapter()) + sumar
//   'whatsapp' a CANALES_AUTOMATICOS en db/validation.ts, nada mas.
export function crearRegistroEnvio(): Record<Canal, EnvioAdapter | null> {
  return {
    correo: crearApolloAdapter(),
    whatsapp: null,
    llamada: null,
  };
}

// Re-exportado por conveniencia (import { CANALES_AUTOMATICOS } from '.../registro-envio'
// donde ya se esta importando crearRegistroEnvio); la fuente real vive en db/validation.ts,
// ver el comentario ahi para el motivo de la direccion de dependencia.
export { CANALES_AUTOMATICOS };
