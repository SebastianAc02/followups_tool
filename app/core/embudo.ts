// Dominio puro del embudo comercial. NO importa DB, Notion, Claude ni UI.
// Toma conteos por etapa (ya resueltos por el Repository) y arma la forma que la
// UI pinta: bandas ordenadas frio->caliente con % de conversion, y las dos tarjetas
// de resultado (ganado / on hold). "sin etapa" (null) se reporta aparte, fuera de
// las bandas (misma decision que el Home: 1437 nulls se comerian la barra).
import { BANDAS_EMBUDO, ETAPA_GANADA, ETAPA_ONHOLD, FUNNEL_ETAPAS } from '../db/funnel';

export type ConteoEtapa = {
  estado: string; // valor de estado_notion, o '__sin_etapa__' para null
  total: number;
  usuarios: number | null; // suma de usuarios_efectivos, null si no hay dato
};

export type BandaEmbudo = {
  estado: string;
  label: string;
  colorClass: string;
  total: number;
  usuarios: number | null;
  conversionDesdeAnterior: number | null; // % vs la banda anterior; null en la primera
};

export type ResultadoEmbudo = {
  estado: string;
  label: string;
  total: number;
  usuarios: number | null;
};

export type Embudo = {
  bandas: BandaEmbudo[];
  ganado: ResultadoEmbudo;
  onHold: ResultadoEmbudo;
  sinEtapa: number;
};

export const CLAVE_SIN_ETAPA = '__sin_etapa__';

export function construirEmbudo(conteos: ConteoEtapa[]): Embudo {
  const porEstado = new Map(conteos.map((c) => [c.estado, c]));
  const get = (estado: string) => porEstado.get(estado) ?? { estado, total: 0, usuarios: null };

  // ── HUECO DE SEBASTIAN (5-10 lineas) ─────────────────────────────
  // Construir `bandas` recorriendo BANDAS_EMBUDO en orden, y para cada una:
  //   - total y usuarios desde get(etapa.estado)
  //   - conversionDesdeAnterior: null en la primera; si no, redondear
  //     (total_actual / total_anterior) * 100. Decidir el denominador.
  // Luego armar ganado = get(ETAPA_GANADA), onHold = get(ETAPA_ONHOLD),
  // sinEtapa = get(CLAVE_SIN_ETAPA).total.
  // TODO(sebastian): escribir aqui. Borrar el throw.
  throw new Error('construirEmbudo: pendiente de implementar');
  // ─────────────────────────────────────────────────────────────────
}
