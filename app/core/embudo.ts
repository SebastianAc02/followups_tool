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

  const bandas: BandaEmbudo[] = BANDAS_EMBUDO.map((etapa, i) => {
    const actual = get(etapa.estado);
    const anterior = i === 0 ? null : get(BANDAS_EMBUDO[i - 1].estado).total;
    const conversionDesdeAnterior = anterior === null || anterior === 0 ? (i === 0 ? null : 0) : Math.round((actual.total / anterior) * 100);
    return {
      estado: etapa.estado,
      label: etapa.label,
      colorClass: etapa.colorClass,
      total: actual.total,
      usuarios: actual.usuarios,
      conversionDesdeAnterior: i === 0 ? null : conversionDesdeAnterior,
    };
  });

  const ganadoConteo = get(ETAPA_GANADA);
  const onHoldConteo = get(ETAPA_ONHOLD);
  const etapaGanada = FUNNEL_ETAPAS.find((e) => e.estado === ETAPA_GANADA);
  const etapaOnHold = FUNNEL_ETAPAS.find((e) => e.estado === ETAPA_ONHOLD);

  return {
    bandas,
    ganado: { estado: ETAPA_GANADA, label: etapaGanada?.label ?? ETAPA_GANADA, total: ganadoConteo.total, usuarios: ganadoConteo.usuarios },
    onHold: { estado: ETAPA_ONHOLD, label: etapaOnHold?.label ?? ETAPA_ONHOLD, total: onHoldConteo.total, usuarios: onHoldConteo.usuarios },
    sinEtapa: get(CLAVE_SIN_ETAPA).total,
  };
}
