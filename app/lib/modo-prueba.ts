import { AsyncLocalStorage } from 'node:async_hooks';

// Modo prueba por request. Gemelo de read-only.ts: requireSession lo marca al inicio de
// cada request leyendo la cookie de modo, y el Proxy del db en app/db/index.ts lo lee
// para resolver contra cual de las dos conexiones (isps.db real / pruebas.db) corre esta
// request. Mismo criterio del candado solo-lectura: un solo punto de choque, ninguna de
// las ~50 acciones se entera ni puede saltarselo.
//
// ALS y no una variable de modulo porque el server procesa requests concurrentes: una en
// modo prueba y una normal pueden convivir, y cada una necesita su propia base.
const store = new AsyncLocalStorage<boolean>();

export function marcarModoPrueba(valor: boolean): void {
  store.enterWith(valor);
}

// Default REAL: sin marca, esta request va contra isps.db.
//
// Aca hubo un throw ("declara el modo o reviento") y se probo en vivo: NO funciona en este
// programa. Dos razones, las dos verificadas el 2026-07-15:
//   1. No hay UN arranque donde declarar. Un servidor Next tiene decenas de entradas que no
//      pasan por requireSession -- webhook de Evolution, pixel y clics de Apollo, callback
//      de Gmail, el worker -- y RSC ademas renderiza componentes en paralelo. El throw
//      reventaba la pagina en el navegador.
//   2. Peor: era decorativo. marcarModoPrueba() usa enterWith, y cualquier modulo que la
//      llame a nivel de modulo marca el CONTEXTO RAIZ del proceso; de ahi en adelante
//      getStore() ya nunca da undefined para nadie y el throw no puede dispararse. O sea
//      el default terminaba siendo false igual, pero por accidente.
//
// `false` y no `true` porque es el comportamiento que el repo siempre tuvo: todo va a la
// real salvo que alguien pida lo contrario. Y las entradas sin sesion (webhook, pixel,
// worker) pertenecen a la base de verdad, asi que caer a real es lo correcto para ellas.
//
// Lo que protege de verdad NO es este default, es que requireSession marque el modo en
// TODA request con sesion (app/lib/session.ts) y que el ALS no se filtre entre requests
// concurrentes -- eso lo cubre el test de app/db/modo-prueba-proxy.test.ts. Si ese test se
// pone rojo, el modo prueba miente y hay que migrar a run().
export function esModoPrueba(): boolean {
  return store.getStore() === true;
}
