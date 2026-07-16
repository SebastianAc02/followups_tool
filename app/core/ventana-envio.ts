// Core puro (constitucion): cuando se puede mandar y cada cuanto. No importa DB ni
// adaptadores; recibe `ahora` y `rand` inyectados para ser determinista en test.
//
// Por que existe (pedido de Sebastian, 2026-07-16): el worker empujaba TODO lo debido de
// una, sin mirar la hora ni espaciar. Dos riesgos reales:
//  - 30 WhatsApps en un minuto por la misma linea es patron de bot: WhatsApp banea la
//    linea y se cae el canal entero. Es lo unico del backlog que se pierde para siempre.
//  - Un correo/WhatsApp comercial a las 2am le quema la cuenta al prospecto, no solo no
//    sirve.
//
// El dia ya lo maneja el motor de fechas (ConfigCalendario.diasBloqueados corre la FECHA
// programada de un paso). Esto es distinto y complementario: la fecha puede ser hoy y aun
// asi ser mala HORA para mandar. Por eso vive aparte y se consulta en el push, no en la
// materializacion.

export type VentanaEnvio = {
  // Hora local de apertura y cierre, formato 24h. La ventana es [desde, hasta): a las
  // `hasta` en punto ya NO se manda.
  horaDesde: number;
  horaHasta: number;
  // Dias de la semana en los que no se manda (0=domingo .. 6=sabado), en hora LOCAL.
  // Mismo vocabulario que ConfigCalendario.diasBloqueados, a proposito.
  diasBloqueados: number[];
  // Offset fijo de la zona horaria local respecto a UTC, en horas. Colombia es -5 todo el
  // año (no tiene horario de verano), asi que un numero alcanza y no hace falta meter una
  // libreria de timezones ni depender del TZ del server (que en Docker suele ser UTC).
  offsetUtc: number;
};

export const VENTANA_DEFAULT: VentanaEnvio = {
  horaDesde: 8,
  horaHasta: 18,
  diasBloqueados: [0, 6], // domingo y sabado
  offsetUtc: -5, // Colombia
};

export type EspaciadoEnvio = { minMs: number; maxMs: number };

// 45-90s aleatorio, no un intervalo fijo: un mensaje cada exactamente 60s es tan patron de
// bot como mandarlos todos juntos. El rango es conservador a proposito.
export const ESPACIADO_WHATSAPP_DEFAULT: EspaciadoEnvio = { minMs: 45_000, maxMs: 90_000 };

const NOMBRE_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export type VeredictoVentana = { puede: true } | { puede: false; motivo: string };

// Hora y dia LOCALES a partir de un instante UTC. Se hace corriendo el instante por el
// offset y leyendo los getters UTC: asi el resultado no depende del TZ del proceso.
function localDe(ahora: Date, offsetUtc: number): { hora: number; minuto: number; dia: number } {
  const corrido = new Date(ahora.getTime() + offsetUtc * 60 * 60 * 1000);
  return { hora: corrido.getUTCHours(), minuto: corrido.getUTCMinutes(), dia: corrido.getUTCDay() };
}

export function dentroDeVentana(ahora: Date, v: VentanaEnvio): VeredictoVentana {
  const { hora, minuto, dia } = localDe(ahora, v.offsetUtc);

  if (v.diasBloqueados.includes(dia)) {
    return { puede: false, motivo: `es ${NOMBRE_DIA[dia]}: no se manda en fin de semana` };
  }
  if (hora < v.horaDesde || hora >= v.horaHasta) {
    const hh = String(hora).padStart(2, '0');
    const mm = String(minuto).padStart(2, '0');
    return {
      puede: false,
      motivo: `son las ${hh}:${mm} (hora local): fuera de la ventana ${v.horaDesde}:00-${v.horaHasta}:00`,
    };
  }
  return { puede: true };
}

// Espera con jitter entre un mensaje y el siguiente. rand se inyecta (0 <= rand < 1) para
// que el test sea determinista; en produccion es Math.random.
export function esperaEntreMensajes(e: EspaciadoEnvio, rand: () => number = Math.random): number {
  return Math.round(e.minMs + rand() * (e.maxMs - e.minMs));
}
