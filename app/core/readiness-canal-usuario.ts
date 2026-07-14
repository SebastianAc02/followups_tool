import type { Canal } from '../db/validation.ts';

// Gate de "este usuario tiene el canal listo A SU NOMBRE" -- eje distinto de
// canales-empresa.ts (que responde si la EMPRESA destino tiene el dato de contacto).
// Puro: quien llama (server action) ya resolvio tieneLineaWhatsappActiva contra la DB
// y lo pasa resuelto -- el core no importa el driver de DB (CLAUDE.md).
export type VeredictoCanal =
  | { listo: true }
  | { listo: false; motivo: string; accion: 'ir_a_conectores' | 'hablar_con_admin' };

const MOTIVO_CORREO =
  'El correo sale por una sola cuenta compartida de equipo. Habla con tu admin antes de lanzar una cadencia de correo.';
const MOTIVO_WHATSAPP =
  'No tienes ninguna línea de WhatsApp conectada. Conecta una en Conectores antes de lanzar.';

export function readinessCanalUsuario(canal: Canal, tieneLineaWhatsappActiva: boolean): VeredictoCanal {
  if (canal === 'correo') return { listo: false, motivo: MOTIVO_CORREO, accion: 'hablar_con_admin' };
  if (canal === 'llamada') return { listo: true };
  // whatsapp
  return tieneLineaWhatsappActiva ? { listo: true } : { listo: false, motivo: MOTIVO_WHATSAPP, accion: 'ir_a_conectores' };
}
