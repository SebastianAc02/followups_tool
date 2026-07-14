import type { ModoConector } from './catalogo.ts';

// Decision de autoridad de escritura de credencial. Pura: el modo viene de la config
// (server-side, no del formulario) y esAdmin de la sesion. Es la garantia real de que un
// miembro no escribe una credencial de equipo aunque manipule el form.
export type DecisionGuardado = { permitido: false } | { permitido: true; scope: 'global' | 'personal' };

export function decidirGuardado(modo: ModoConector, esAdmin: boolean): DecisionGuardado {
  if (modo === 'admin') return esAdmin ? { permitido: true, scope: 'global' } : { permitido: false };
  return { permitido: true, scope: 'personal' };
}

// Simetrico a decidirGuardado pero para LECTURA: revelar una credencial modo admin
// exige ser admin (igual que guardarla); una credencial modo personal nunca se
// revela por esta via, ni a un admin -- es la credencial de otra persona, no del
// equipo (2026-07-14, pedido de Sebastian: "que aparezcan las credenciales de
// Apollo", nunca las de Granola de alguien mas).
export function puedeRevelarCredencial(modo: ModoConector, esAdmin: boolean): boolean {
  return modo === 'admin' && esAdmin;
}
