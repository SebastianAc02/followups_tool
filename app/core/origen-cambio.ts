// Core puro (hexagonal): de donde viene la verdad de un cambio de etapa, y que se hace en
// consecuencia. No importa el Repository, ni el adaptador de Notion, ni el outbox: solo
// traduce una intencion del negocio a una decision. Quien la ejecuta es actualizarEstadoNotion()
// (app/db/repository.ts), que recibe el booleano ya resuelto.
//
// Por que existe este archivo, y no un flag suelto en el MCP: la regla "un cambio que vino de
// Notion no se devuelve a Notion" es de negocio, no de transporte. Es la misma frase que
// Sebastian usa al reconciliar ("Notion manda en Estado"). Hoy la necesitan dos llamadores
// distintos -- el MCP (mover_estado) y el sync por script (scripts/sync_estados_notion.ts) --
// y manana la va a necesitar el webhook. Copiada en cada uno, se desincroniza: ya paso en este
// repo con la logica de dedupe de load/ (Python) contra la de app/core/reconciliacion/.
//
// El bounce-back que esto evita: Notion -> DB -> Notion. El sync baja el estado de Notion, lo
// escribe en la DB, el outbox lo ve como cambio local y lo vuelve a subir a Notion. Escritura
// inutil sobre el CRM de otra persona, y en el peor caso pisa un cambio mas nuevo.

export const ORIGENES_CAMBIO = ['notion', 'herramienta'] as const;

/**
 * De donde salio el cambio de etapa.
 * - 'notion': Notion ya tenia el dato y la DB venia atrasada (reconciliacion, sync).
 * - 'herramienta': el cambio nacio aca (el brain movio la cuenta) y el CRM espejo debe enterarse.
 */
export type OrigenCambio = (typeof ORIGENES_CAMBIO)[number];

/**
 * Decide si un cambio de etapa debe viajar DB -> Notion por el outbox.
 *
 * @param origen  De donde vino el cambio. Puede llegar undefined: los llamadores viejos
 *                (el write-path del MCP de 2026-07-24) no lo pasan.
 * @returns       true si el cambio debe encolarse hacia Notion, false si se queda en la DB.
 *
 * El default (origen undefined) es NO encolar, por decision de Sebastian el 2026-07-25: hoy
 * nada sale hacia Notion de forma automatica, y no debe salir hasta que se conozcan todos los
 * casos. La replica hacia Notion la dispara el, a traves de Claude, una vez al dia o por
 * evento. Encolar solo ocurre cuando alguien lo pide explicito con origen 'herramienta'.
 *
 * Se prefirio este default sobre el contrario ('herramienta', que preservaba el comportamiento
 * del write-path de 2026-07-24) porque los dos fallan en silencio, pero no cuestan lo mismo:
 * olvidar el parametro al reconciliar escribiria sobre el CRM de otra persona, mientras que
 * olvidarlo al mover una cuenta solo deja a Notion sin enterarse, que es exactamente el estado
 * en el que ya se opera hoy.
 */
export function debeEncolarHaciaNotion(origen?: OrigenCambio): boolean {
  return origen === 'herramienta';
}
