// Dominio puro del estado PBX y su bucle de enriquecimiento. NO importa DB/IA/UI.
import type { Canal } from '../db/validation.ts';

export type FormaPaso =
  | 'llamar_conmutador'
  | 'conseguir_numero'
  | 'enviar_correo'
  | 'esperar'
  | 'hablar_con'
  | 'escalar'
  | 'graduar';

export type ContactoPBX = {
  esKeyDecisionMaker: boolean;
  telefono: string | null;
  email: string | null;
};

// Canales directos alcanzables SOLO via contactos KDM. Distinto de canalesDisponibles
// (canales-empresa.ts), que cuenta cualquier contacto: ese se queda para readiness de
// campañas; este es el eje de PBX.
export function canalesDisponiblesKDM(contactos: ContactoPBX[]): Set<Canal> {
  const dir = new Set<Canal>();
  for (const c of contactos) {
    if (!c.esKeyDecisionMaker) continue;
    if (c.email) dir.add('correo');
    if (c.telefono) {
      dir.add('llamada');
      dir.add('whatsapp');
    }
  }
  return dir;
}

export function estaEnPBX(contactos: ContactoPBX[]): boolean {
  // ── HUECO DE SEBASTIÁN (2-4 lineas) ────────────────────────────
  // Definir el predicado: una empresa esta en PBX cuando NO hay un KDM alcanzable
  // por su metodo directo. Decidir si el correo del KDM basta para NO estar en PBX,
  // o si PBX es especificamente "sin telefono/WhatsApp del KDM".
  // Usa canalesDisponiblesKDM(contactos). Borra el throw.
  throw new Error('estaEnPBX: pendiente');
  // ───────────────────────────────────────────────────────────────
}
