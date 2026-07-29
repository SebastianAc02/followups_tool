// Por qué un paso_inscripcion NO va a salir (empujar_envios del MCP, 2026-07-28).
//
// El problema que resuelve: la cola real (pasoInscripcionesPendientes + agruparPendientesCorreo)
// contesta con una LISTA, no con un motivo. Una fila que no está en esa lista se ve exactamente
// igual que una que sí está y todavía no le toca: el descarte de correo es un `continue` pelado,
// el de whatsapp también, y ninguno marca la fila ni loguea nada por sí solo. Preguntar "¿por qué
// esta no sale?" no tenía respuesta sin leer seis condiciones a mano contra la base.
//
// Esta función es SOLO explicación, nunca decisión. Quien decide si un paso sale sigue siendo la
// consulta real, y empujarEnviosTool la usa como fuente de verdad (`saldra = está en la lista`).
// Esto se llama únicamente para el "no". La razón es el riesgo obvio de tener dos implementaciones
// de la misma regla: si esta se desactualiza, lo peor que puede pasar es un texto incompleto, no
// una fila que se dé por enviable y no salga (ni al revés). Cuando la lista dice que no sale y
// esto no encuentra ni un motivo, se dice justamente eso, en vez de inventar uno.
import type { Canal } from '../db/validation.ts';

export type EstadoEmpujon = {
  estadoPaso: string;
  canal: string;
  esManual: boolean;
  aprobadoEn: string | null;
  intentos: number;
  proximoIntento: string | null;
  fechaProgramada: string | null;
  estadoCampana: string;
  estadoInscripcion: string;
  estadoDestinatario: string | null;
  proveedorCampanaId: string | null;
  aprobadaEnvioGmail: boolean;
  // 'gmail' | 'apollo' | null (null = el canal no es correo). Sale de decidirProveedorCorreo,
  // que es la MISMA decisión que usa el envío: el gate de aprobada_envio_gmail solo muerde
  // cuando la campaña manda por Gmail.
  proveedorCorreo: 'gmail' | 'apollo' | null;
  email: string | null;
  telefono: string | null;
  // Sólo importa para whatsapp: la línea activa del DUEÑO de la campaña. Sin ella la fila se
  // salta entera en pasoInscripcionesPendientes, sin dejar rastro.
  lineaWhatsappDelOwner: boolean;
};

const ESTADOS_EMPUJABLES = ['pendiente', 'fallo'];

export function motivosNoSale(c: EstadoEmpujon, ahora: string, maxIntentos: number): string[] {
  const motivos: string[] = [];

  if (!ESTADOS_EMPUJABLES.includes(c.estadoPaso)) {
    motivos.push(
      c.estadoPaso === 'enviada'
        ? 'el paso ya salió (estado enviada)'
        : c.estadoPaso === 'enviando'
          ? "el paso quedó en 'enviando': el proceso se cayó entre marcarlo y recibir la respuesta del proveedor, y no se reintenta solo"
          : `el paso está en '${c.estadoPaso}', y sólo se empuja lo que está en 'pendiente' o 'fallo'`,
    );
  }
  if (c.estadoCampana !== 'activa') {
    motivos.push(`la campaña está en '${c.estadoCampana}': la cola sólo mira campañas 'activa'`);
  }
  if (c.estadoInscripcion !== 'activa') {
    motivos.push(`la inscripción está en '${c.estadoInscripcion}', no activa`);
  }
  if (c.estadoDestinatario !== null && c.estadoDestinatario !== 'activo') {
    motivos.push(`el destinatario está en '${c.estadoDestinatario}', no activo`);
  }

  // Los dos gates de revisión humana. Son distintos y por eso se dicen distinto: es_manual es una
  // propiedad del PASO de la cadencia, y el de whatsapp es del CANAL y no se puede apagar.
  if (c.esManual && c.aprobadoEn === null) {
    motivos.push('el paso es es_manual=1 y nadie lo aprobó: exige revisión humana (programar_envios) antes de salir');
  }
  if (c.canal === 'whatsapp' && c.aprobadoEn === null) {
    motivos.push('WhatsApp no sale sin revisión humana: hace falta aprobar y programar el texto (programar_envios). Este gate NO se salta empujando');
  }

  if (c.intentos >= maxIntentos) {
    motivos.push(`ya agotó los ${maxIntentos} intentos: la cola no lo vuelve a tomar`);
  }
  if (c.proximoIntento !== null && c.proximoIntento > ahora) {
    motivos.push(`está en backoff hasta ${c.proximoIntento} después de ${c.intentos} intento(s) fallido(s)`);
  }
  // El único motivo que `adelantar: true` arregla. Se nombra igual siempre para que el que lee
  // sepa qué hacer sin leer el resto.
  if (c.fechaProgramada !== null && c.fechaProgramada > ahora) {
    motivos.push(`está programado para ${c.fechaProgramada}, que todavía no llegó (adelantar: true lo baja a ahora)`);
  }

  if (c.canal === 'correo') {
    if (c.proveedorCampanaId === null) {
      motivos.push('campana.proveedor_campana_id está en NULL: un paso de correo sin eso ni siquiera entra a la cola');
    }
    if (c.proveedorCorreo === 'gmail' && !c.aprobadaEnvioGmail) {
      motivos.push(
        'la campaña manda por Gmail y campana.aprobada_envio_gmail está en 0: la fila se descarta sin marcarse fallo y se queda pendiente para siempre',
      );
    }
    if (!c.email) motivos.push('el contacto no tiene email: no hay a dónde mandarlo');
  }
  if (c.canal === 'whatsapp') {
    if (!c.telefono) motivos.push('el contacto no tiene teléfono: no hay a dónde mandarlo');
    if (!c.lineaWhatsappDelOwner) {
      motivos.push('el dueño de la campaña no tiene línea de WhatsApp activa: la fila se salta entera, sin gastar intento y sin dejar rastro');
    }
  }
  if (c.canal === 'llamada') {
    motivos.push('llamada no tiene proveedor automático: se hace a mano y el paso se cierra al registrar el toque, no empujando');
  }

  return motivos;
}

export function esCanalConProveedor(canal: string): canal is Canal {
  return canal === 'correo' || canal === 'whatsapp';
}
