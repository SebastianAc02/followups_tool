// Core puro (sin DB): a que estado_notion avanza una empresa cuando llega un TOQUE
// manual (registrarToque). Fase 5 de docs/plan-produccion-cro-campana.md ("Realidad
// del deal"): hoy un toque no mueve la etapa comercial, solo dispara el sync a Notion
// de campos sueltos (proximo_paso, fecha_ultimo_contacto...) -- estado_notion se queda
// quieto hasta que alguien lo cambie a mano en Notion.
//
// Decision de diseño (2026-07-21): la regla que pidio Sebastian es "solo avanza, nunca
// retrocede". Eso se podria resolver con un ranking generico sobre FUNNEL_ETAPAS
// (db/funnel.ts) -- comparar indices y avanzar si el destino es mayor. Se descarto a
// proposito: un ranking generico dispara para CUALQUIER estado de origen, y eso abre
// una puerta que nadie pidio. Ejemplo real: 'lead' es un contacto DORMIDO por regla de
// negocio ya fijada (2026-07-15, ver colaDelDia) -- iguales a on_hold, "no se despierta
// solo porque tiene un toque". Si aca el ranking dijera "lead (idx 0) < contacto_iniciado
// (idx 1), avanza", un toque suelto sobre un lead lo graduaria a contacto_iniciado sin
// que nadie tomara esa decision, contradiciendo esa regla.
//
// En cambio se listan los DOS pares (origen -> destino) que se pidieron, cerrados:
//   - on_hold                          + cualquier resultado       -> contacto_iniciado
//   - on_hold | contacto_iniciado      + resultado 'contesto_reunion' -> reunion_agendada
// Cualquier otro estado de origen (lead, oportunidad, cierre_documentacion, null...) no
// dispara nada aca. Eso resuelve "nunca retrocede" sin necesidad de un ranking: una
// empresa ya en 'oportunidad' que recibe un toque con resultado 'contesto_reunion' NO
// vuelve a 'reunion_agendada' (no esta en la lista de origenes permitidos), y una que ya
// esta en 'cierre_documentacion' tampoco cae a 'contacto_iniciado'. Es una lista blanca,
// mas facil de auditar que un ranking, y no obliga a mantenerla sincronizada con
// FUNNEL_ETAPAS cada vez que se agregue una etapa nueva al funnel.

import type { Resultado } from '../db/validation';

export const ESTADO_ON_HOLD = 'on_hold';
export const ESTADO_CONTACTO_INICIADO = 'contacto_iniciado';
export const ESTADO_REUNION_AGENDADA = 'reunion_agendada';

// null = no hay transicion que aplicar (la empresa se queda en su estado actual).
export function estadoDestinoPorToque(estadoActual: string | null, resultado: Resultado): string | null {
  const vieneDeOnHold = estadoActual === ESTADO_ON_HOLD;
  const vieneDeContactoIniciado = estadoActual === ESTADO_CONTACTO_INICIADO;

  if (resultado === 'contesto_reunion' && (vieneDeOnHold || vieneDeContactoIniciado)) {
    return ESTADO_REUNION_AGENDADA;
  }
  if (vieneDeOnHold) {
    return ESTADO_CONTACTO_INICIADO;
  }
  return null;
}
