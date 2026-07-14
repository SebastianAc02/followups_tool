import { AsyncLocalStorage } from 'node:async_hooks';

// Candado de solo-lectura por request (modo visitante). requireSession lo marca al
// inicio de cada request (toda accion/pagina lo llama primero); el Proxy del db en
// app/db/index.ts lo lee para rechazar escrituras. Un solo punto de choque: no hay que
// gatear las ~50 acciones una por una, ninguna escritura a la DB se puede saltar el
// candado. ALS (no una variable de modulo) porque el server procesa varias requests
// concurrentes: cada una necesita su propio valor, sin pisarse.
const store = new AsyncLocalStorage<boolean>();

// enterWith (no run): requireSession no envuelve el resto de la request en un callback,
// solo setea el valor "de aqui en adelante" en el mismo contexto async. Verificado que
// propaga a traves del await de requireSession hasta las escrituras posteriores.
export function marcarSoloLectura(valor: boolean): void {
  store.enterWith(valor);
}

export function esSoloLectura(): boolean {
  return store.getStore() === true;
}

// Escape hatch para las pocas escrituras que un visitante SI puede hacer (conectar una
// linea de WhatsApp de prueba, decision 2026-07-14). Corre fn con el candado abierto solo
// para esa operacion, sin tocar el resto de la request.
export function conEscritura<T>(fn: () => T): T {
  return store.run(false, fn);
}

export class ErrorSoloLectura extends Error {
  constructor() {
    super('Modo visitante: solo lectura, no se puede escribir ni enviar.');
    this.name = 'ErrorSoloLectura';
  }
}
