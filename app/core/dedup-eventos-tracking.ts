// Deduplicacion de evento_tracking (spec dedup, seccion 3). Modulo PURO: sin DB,
// sin red, sin reloj propio -- recibe la lista de eventos ya resuelta por el llamador
// y devuelve el veredicto de agrupacion para cada uno. Nada se borra: evento_tracking
// no se toca, esto solo calcula que fila pertenece a que grupo. Mismo patron de
// "ventana encadenada" que matcher.ts (agruparCandidatas): la distancia que cuenta es
// contra el evento anterior DENTRO del grupo, no contra el primero.
//
// Caso canonico verificado en produccion (campana 58 y evento viejo de EAFIT): eventos
// 8 y 9 del 2026-07-27, mismo paso 113, tipo 'abierto', separados por 5ms -- un doble
// disparo del mismo pixel en el mismo render -- se agrupan como una sola apertura. El
// evento 6 del mismo paso, 2 minutos y 22 segundos antes, queda afuera del grupo: fuera
// de la ventana de 2000ms, es una apertura real distinta.

export const VENTANA_DEDUP_MS = 2000;

export type TipoEventoTracking = 'abierto' | 'clic' | 'visto';

export type EventoParaDedup = {
  id_evento: number;
  id_paso_inscripcion: number;
  tipo: TipoEventoTracking;
  fecha_evento: string; // ISO-8601 UTC
  ip?: string | null;
};

export type ResultadoDedup = {
  id_evento: number;
  grupo_dedup_id: number; // id_evento del representante (el mas temprano del grupo)
  es_representante_grupo: boolean;
};

function msEntre(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime());
}

// Desempate por IP (seccion 3): si el evento entrante y la ip ya confirmada del grupo son
// no nulas y distintas, son dos dispositivos y no se agrupan aunque el tiempo de sobra. Se
// compara contra la ip del GRUPO (la primera no nula vista en la cadena), no solo contra el
// evento inmediatamente anterior: un evento sin ip en el medio (viejo, sin huella) no puede
// actuar de puente entre dos ips reales y distintas. Si ninguna de las dos tiene ip, el
// desempate no aplica.
function mismoDispositivoOSinDato(ipEntrante: string | null | undefined, ipGrupo: string | null): boolean {
  if (ipEntrante && ipGrupo) return ipEntrante === ipGrupo;
  return true;
}

// Clave de bucket: mismo id_paso_inscripcion y mismo tipo. La ventana de tiempo y el
// desempate por ip solo aplican DENTRO de un bucket; entre buckets nunca hay grupo,
// sin importar que tan cerca caigan en el tiempo.
function claveBucket(e: EventoParaDedup): string {
  return `${e.id_paso_inscripcion}::${e.tipo}`;
}

export function agruparDuplicados(eventos: EventoParaDedup[]): ResultadoDedup[] {
  const buckets = new Map<string, EventoParaDedup[]>();
  for (const evento of eventos) {
    const clave = claveBucket(evento);
    const lista = buckets.get(clave);
    if (lista) lista.push(evento);
    else buckets.set(clave, [evento]);
  }

  const resultadoPorId = new Map<number, ResultadoDedup>();

  for (const lista of buckets.values()) {
    // Orden ascendente por fecha; empate de fecha se desempata por id_evento para que
    // el representante sea deterministico sin depender del orden de llegada.
    const ordenados = [...lista].sort((a, b) => {
      const porFecha = new Date(a.fecha_evento).getTime() - new Date(b.fecha_evento).getTime();
      return porFecha !== 0 ? porFecha : a.id_evento - b.id_evento;
    });

    let representanteActual: EventoParaDedup | null = null;
    let ultimoEnCadena: EventoParaDedup | null = null;
    // Ip confirmada del grupo actual: la primera no nula vista desde que arranco el grupo.
    // Se resetea cada vez que arranca un grupo nuevo (seFusiona === false).
    let ipGrupo: string | null = null;

    for (const evento of ordenados) {
      const seFusiona =
        ultimoEnCadena !== null &&
        msEntre(evento.fecha_evento, ultimoEnCadena.fecha_evento) <= VENTANA_DEDUP_MS &&
        mismoDispositivoOSinDato(evento.ip, ipGrupo);

      if (!seFusiona) {
        representanteActual = evento;
        ipGrupo = evento.ip ?? null;
      } else if (!ipGrupo && evento.ip) {
        ipGrupo = evento.ip;
      }

      resultadoPorId.set(evento.id_evento, {
        id_evento: evento.id_evento,
        grupo_dedup_id: (representanteActual as EventoParaDedup).id_evento,
        es_representante_grupo: !seFusiona,
      });

      ultimoEnCadena = evento;
    }
  }

  // Se devuelve en el mismo orden de entrada: el llamador no tiene que reordenar para
  // reconciliar contra sus filas.
  return eventos.map((e) => resultadoPorId.get(e.id_evento) as ResultadoDedup);
}
