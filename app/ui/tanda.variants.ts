// Vocabulario visual compartido por las dos pantallas que salen de tandasTool (Toques y
// Seguimiento, paso 6 de la propuesta de tandas): la etiqueta humana de cada tanda y su tono.
// Un solo lugar para que "rellamada" se lea "Re-llamadas" igual en las dos pantallas -- textos
// que hoy dice el mismo dato con dos palabras distintas son la misma clase de bug que las tres
// composiciones de "toques de hoy" que existian antes de app/cola/hoy.ts.
import type { Tanda } from "../core/tandas";

export const TANDA_LABEL: Record<Tanda, string> = {
  fuera: "Fuera",
  esperar: "Esperando",
  bloqueado_por_tarea: "Esperando de ti",
  cierre: "Cierre",
  reunion: "Reunión",
  respondio: "Respondió",
  agotada: "Agotada",
  enfriandose: "Enfriándose",
  rellamada: "Re-llamadas",
  frio: "Frío",
  cadencia: "Cadencia",
  sin_campana: "Sin campaña",
};

export type TonoTanda = "hot" | "warm" | "cold" | "deuda";

// hot = lo mas caliente del pipeline (cierre/reunion) y lo que ya respondio -- se llama primero.
// warm = trabajo normal de seguimiento. cold = frio de verdad (agotada, sin campana, sin toques).
// deuda = bloqueado_por_tarea: no es del prospecto, es tarea del operador -- tono propio para que
// no se confunda con "no contesta".
export const TANDA_TONO: Record<Tanda, TonoTanda> = {
  fuera: "cold",
  esperar: "cold",
  bloqueado_por_tarea: "deuda",
  cierre: "hot",
  reunion: "hot",
  respondio: "hot",
  agotada: "cold",
  enfriandose: "warm",
  rellamada: "warm",
  frio: "cold",
  cadencia: "cold",
  sin_campana: "cold",
};

export const TANDA_TONO_CLASE: Record<TonoTanda, string> = {
  hot: "border-today/40 bg-today/10 text-today",
  warm: "border-accent/40 bg-accent/10 text-accent-soft",
  cold: "border-line-strong bg-surface text-muted",
  deuda: "border-amber-400/40 bg-amber-400/10 text-amber-400",
};

// null es tiempo DESCONOCIDO, no cero (ver el comentario de diasEnEstado en core/tandas.ts): se
// lee distinto a propósito, nunca como "0 días" ni como si acabara de entrar.
export function textoDiasEnEstado(dias: number | null): string {
  if (dias == null) return "sin fecha de referencia";
  if (dias === 0) return "hoy";
  if (dias === 1) return "1 día quieta";
  return `${dias} días quieta`;
}
