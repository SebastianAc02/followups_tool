import { AsyncLocalStorage } from 'node:async_hooks';
import { esModoPrueba } from './modo-prueba';

// Reloj de demo por request. Gemelo de read-only.ts y modo-prueba.ts: requireSession
// marca el offset al inicio de cada request leyendo la cookie de reloj, y hoy() lo suma
// a la fecha real. enterWith (no run) por la misma razon que los otros dos ALS: no hay
// que reescribir cada action/page como callback.
//
// El offset SOLO aplica en modo prueba. No es disciplina: el getter lo fuerza. isps.db
// no tiene la cookie de modo prueba, asi que esModoPrueba() es false ahi y hoy() cae a la
// fecha real por diseño, imposible de filtrar a produccion.
const store = new AsyncLocalStorage<number>();

export function marcarOffsetDias(dias: number): void {
  store.enterWith(dias);
}

export function offsetActual(): number {
  if (!esModoPrueba()) return 0;
  return store.getStore() ?? 0;
}

// Reemplaza `new Date().toISOString().slice(0, 10)` en las paginas RSC. En modo prueba,
// suma el offset del reloj de demo; en real, es la fecha de hoy sin mas.
export function hoy(): string {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + offsetActual());
  return base.toISOString().slice(0, 10);
}
