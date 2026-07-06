import type { SyncAdapter, CambioNotion } from './ports/sync';

export type FilaOutbox = { idOutbox: number; payload: CambioNotion; intentos: number };

export type OutboxDeps = {
  pendientes: () => FilaOutbox[];
  marcarEnviado: (idOutbox: number) => void;
  marcarFallido: (idOutbox: number, intentos: number, proximoIntento: string | null) => void;
};

// Backoff exponencial con tope: reintentos agresivos golpean rate limits de Notion,
// tibios dejan la fila pendiente dias si el laptop duerme. 5 intentos (~14h en total)
// antes de marcar fallido definitivo, despues de eso, Sebastian tiene que revisar
// a mano por que Notion no acepta el cambio (token vencido, pagina borrada, etc.).
const ESCALONES_MINUTOS = [1, 5, 30, 120, 720];
export const MAX_INTENTOS = ESCALONES_MINUTOS.length;

export function calcularProximoIntento(intentos: number, ahora: Date): Date {
  const minutos = ESCALONES_MINUTOS[Math.min(intentos - 1, ESCALONES_MINUTOS.length - 1)];
  return new Date(ahora.getTime() + minutos * 60_000);
}

// Idempotente por construccion: una fila ya drenada pasa a estado 'enviado' y
// `pendientes()` deja de devolverla, asi que drenar dos veces solo manda a Notion
// una vez sin necesitar un flag aparte.
export async function drenarOutbox(deps: OutboxDeps, notion: SyncAdapter, ahora: Date = new Date()): Promise<void> {
  for (const fila of deps.pendientes()) {
    try {
      await notion.actualizarPagina(fila.payload);
      deps.marcarEnviado(fila.idOutbox);
    } catch {
      const intentos = fila.intentos + 1;
      const agotado = intentos >= MAX_INTENTOS;
      deps.marcarFallido(fila.idOutbox, intentos, agotado ? null : calcularProximoIntento(intentos, ahora).toISOString());
    }
  }
}
