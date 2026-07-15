import type { Canal } from '../db/validation.ts';

// Gate de "este usuario tiene el canal listo A SU NOMBRE" -- eje distinto de
// canales-empresa.ts (que responde si la EMPRESA destino tiene el dato de contacto).
// Puro: quien llama (server action) ya resolvio tieneLineaWhatsappActiva/
// tieneGmailVerificado contra la DB y lo pasa resuelto -- el core no importa el
// driver de DB (CLAUDE.md).
export type VeredictoCanal =
  | { listo: true }
  | { listo: false; motivo: string; accion: 'ir_a_conectores' | 'hablar_con_admin' };

// Gmail Etapa 2 (2026-07-15): antes esto bloqueaba correo SIEMPRE (el buzon
// compartido de Apollo a nombre de otra persona era el unico camino -- problema de
// confianza con el prospecto). Ahora que cada usuario puede conectar su propio Gmail,
// el gate se abre SOLO para quien lo tiene verificado -- sin Gmail propio, sigue
// bloqueado (decision explicita de Sebastian, 2026-07-15): abrirlo sin excepcion
// reabriria el mismo problema de confianza que motivo separar Gmail de Apollo.
const MOTIVO_CORREO =
  'Conecta tu Gmail en Conectores antes de lanzar una cadencia de correo (o pide que alguien con Gmail conectado la lance).';
const MOTIVO_WHATSAPP =
  'No tienes ninguna línea de WhatsApp conectada. Conecta una en Conectores antes de lanzar.';

export function readinessCanalUsuario(canal: Canal, tieneLineaWhatsappActiva: boolean, tieneGmailVerificado: boolean): VeredictoCanal {
  if (canal === 'correo') return tieneGmailVerificado ? { listo: true } : { listo: false, motivo: MOTIVO_CORREO, accion: 'ir_a_conectores' };
  if (canal === 'llamada') return { listo: true };
  // whatsapp
  return tieneLineaWhatsappActiva ? { listo: true } : { listo: false, motivo: MOTIVO_WHATSAPP, accion: 'ir_a_conectores' };
}
