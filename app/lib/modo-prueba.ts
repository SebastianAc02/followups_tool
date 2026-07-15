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

// Sin default a proposito: si nadie declaro el modo, esto revienta en vez de adivinar.
//
// Las dos alternativas eran elegir un default con `??`, y las dos fallan en silencio:
// `?? false` (real) hace que una request que perdio su marca escriba en isps.db y le
// mande correo real a un ISP; `?? true` (prueba) hace que cualquier script que no marque
// el ALS escriba en la base equivocada sin que nadie se entere. Las dos compran comodidad
// hoy a cambio de un fallo mudo despues, y en este repo eso ya salio caro dos veces
// (listarCampanas() sin filtro de organizacion, contadoresHoy perdiendo 70 filas).
//
// El precio del throw es tocar una vez las 9 entradas que no pasan por requireSession
// (los scripts de scripts/*.ts): cada una declara su modo con marcarModoPrueba(false).
// A cambio, un script nuevo que se olvide revienta en su primer acceso a la DB, no tres
// semanas despues con datos mezclados.
export function esModoPrueba(): boolean {
  const marca = store.getStore();
  if (marca === undefined) {
    throw new Error(
      'Contexto sin modo declarado: llama marcarModoPrueba(false) al arrancar (los scripts) ' +
        'o entra por requireSession() (las requests). No hay default: elegir uno a ciegas ' +
        'escribe en la base equivocada en silencio.',
    );
  }
  return marca;
}
