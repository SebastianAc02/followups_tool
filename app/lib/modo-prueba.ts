import { AsyncLocalStorage } from 'node:async_hooks';

// Modo prueba por request. El Proxy del db en app/db/index.ts lee esModoPrueba() para
// resolver contra cual de las dos conexiones (isps.db real / pruebas.db) corre esta
// request. Un solo punto de choque: ninguna de las ~50 acciones se entera ni puede
// saltarselo.
//
// ALS y no una variable de modulo porque el server procesa requests concurrentes: una en
// modo prueba y una normal pueden convivir, y cada una necesita su propia base.
//
// EL ALS GUARDA UNA CAJA MUTABLE, NO UN BOOLEANO. Esa indireccion es el corazon del diseño
// y se paga porque enterWith tiene una trampa que mordio en vivo (2026-07-15, reproducida
// en modo-prueba-await.test.ts):
//
//   El cuerpo de una funcion async corre en el contexto del LLAMADOR solo hasta su primer
//   await; de ahi en adelante vive en un contexto hijo. requireSession resuelve el modo
//   DESPUES de awaitear getSession, asi que un enterWith(boolean) ahi adentro marcaba un
//   contexto que moria al retornar: la page/action que la awaitea seguia leyendo isps.db
//   con el banner diciendo MODO PRUEBA. Vivio sin que nadie lo viera porque los tests
//   marcaban el modo sincrono en el mismo contexto -- nunca reprodujeron la forma real
//   (marcar dentro de una async awaiteada, consultar en el llamador).
//
// Con la caja, requireSession la RESERVA antes de su primer await (ahi todavia corre en el
// contexto del llamador, asi que el enterWith si le pega al padre) y la LLENA despues.
// Comparten la misma referencia, de modo que la escritura tardia se ve desde arriba. run()
// seria la otra salida, pero obliga a envolver el cuerpo de cada page y cada action en un
// callback: 50 archivos, y basta que uno se olvide para que su request escriba en la base
// real en silencio.
const store = new AsyncLocalStorage<{ valor: boolean }>();

// La usa requireSession, y SIEMPRE antes de su primer await. Llamarla despues de un await
// la vuelve inutil (marcaria un contexto hijo que nadie va a leer): ese es exactamente el
// bug que este diseño existe para evitar.
export function reservarModo(): { valor: boolean } {
  const caja = { valor: false };
  store.enterWith(caja);
  return caja;
}

// Marca directa, para scripts y tests: ahi no hay request ni requireSession, se declara el
// modo sincrono al arrancar y listo.
export function marcarModoPrueba(valor: boolean): void {
  store.enterWith({ valor });
}

// Default REAL: sin caja en el contexto, esta request va contra isps.db.
//
// Aca hubo un throw ("declara el modo o reviento") y se probo en vivo: NO funciona en este
// programa. Un servidor Next tiene decenas de entradas que no pasan por requireSession --
// webhook de Evolution, pixel y clics de Apollo, callback de Gmail, el worker -- y RSC
// ademas renderiza componentes en paralelo; el throw reventaba la pagina en el navegador.
//
// `false` y no `true` porque es el comportamiento que el repo siempre tuvo: todo va a la
// real salvo que alguien pida lo contrario. Y las entradas sin sesion (webhook, pixel,
// worker) pertenecen a la base de verdad, asi que caer a real es lo correcto para ellas.
export function esModoPrueba(): boolean {
  return store.getStore()?.valor === true;
}
