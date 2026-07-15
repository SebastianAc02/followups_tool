// Core puro: decide si un contacto que viene del export de Notion (T11) es el decisor
// de la cuenta (es_key_decision_maker). No toca DB ni adapters.
//
// La regla es la PROCEDENCIA, no el cargo (decision de Sebastian, 2026-07-15): si un
// contacto vino de Notion, alguien ya hizo el trabajo de conseguirlo -- es una persona
// real, y el "Contacto Principal" es por definicion con quien se esta hablando. Que el
// campo "Cargo Contacto" venga vacio no lo vuelve un desconocido: solo significa que
// nadie lleno el campo (96 de 201 contactos reales estan asi).
//
// Por eso NO se infiere del texto del cargo como regla principal: eso cubria 36 de 201.
// El cargo solo se usa para el Buying Comittee, donde SI hay varias personas y hay que
// distinguir al que decide del tecnico o el de cartera.
import { clasificarCargo, type CargoCategoria } from './clasificarCargo.ts';

const CARGOS_QUE_DECIDEN: ReadonlySet<CargoCategoria> = new Set<CargoCategoria>([
  'dueno',
  'gerente',
  'subgerente',
  'rep_legal',
]);

export function esKdmDesdeNotion(entrada: { esPrincipal: boolean; cargo: string }): boolean {
  if (entrada.esPrincipal) return true;
  return CARGOS_QUE_DECIDEN.has(clasificarCargo(entrada.cargo));
}
