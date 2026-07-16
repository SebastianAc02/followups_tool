import { AsyncLocalStorage } from 'node:async_hooks';
import { esModoPrueba } from './modo-prueba';

// Reloj de demo por request. requireSession reserva la caja y la llena con la cookie del
// reloj; hoy() suma ese offset a la fecha real.
//
// Caja mutable y no un numero suelto, por la misma razon que modo-prueba.ts (leer el
// comentario largo de ahi): un enterWith despues de un await no lo ve el llamador, y
// encima muta el contexto raiz del proceso, filtrando el valor a las demas requests.
// requireSession RESERVA antes de su primer await y LLENA despues.
//
// El offset SOLO aplica en modo prueba. No es disciplina: el getter lo fuerza. isps.db no
// tiene la cookie de modo prueba, asi que esModoPrueba() es false ahi y hoy() cae a la
// fecha real por diseño, imposible de filtrar a produccion.
const store = new AsyncLocalStorage<{ dias: number }>();

// La usa requireSession, SIEMPRE antes de su primer await.
export function reservarOffset(): { dias: number } {
  const caja = { dias: 0 };
  store.enterWith(caja);
  return caja;
}

// Fija el offset de ESTA request. Muta la caja que ya existe (para que lo vea todo lo que
// venga despues en la misma request, aunque cruce awaits); si no hay caja -- scripts,
// tests -- crea una en el contexto actual.
export function marcarOffsetDias(dias: number): void {
  const caja = store.getStore();
  if (caja) caja.dias = dias;
  else store.enterWith({ dias });
}

export function offsetActual(): number {
  if (!esModoPrueba()) return 0;
  return store.getStore()?.dias ?? 0;
}

// Reemplaza `new Date().toISOString().slice(0, 10)` en las paginas RSC. En modo prueba,
// suma el offset del reloj de demo; en real, es la fecha de hoy sin mas.
export function hoy(): string {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + offsetActual());
  return base.toISOString().slice(0, 10);
}
