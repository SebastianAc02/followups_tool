import { cookies } from 'next/headers';

// Cookie de SESION (sin maxAge): muere al cerrar el navegador. A proposito -- un modo
// prueba que se queda pegado en silencio es peor que uno que hay que volver a prender.
// Mismo bug que ya mordio con BETTER_AUTH_URL en .env.local el 2026-07-14.
//
// httpOnly: el modo lo decide el servidor (requireSession lo lee y marca el ALS), el
// cliente no tiene por que poder escribirlo desde JS.
export const COOKIE_MODO_PRUEBA = 'modo_prueba';

export async function leerCookieModoPrueba(): Promise<boolean> {
  const store = await cookies();
  return store.get(COOKIE_MODO_PRUEBA)?.value === '1';
}

export async function escribirCookieModoPrueba(valor: boolean): Promise<void> {
  const store = await cookies();
  if (valor) {
    store.set(COOKIE_MODO_PRUEBA, '1', { httpOnly: true, sameSite: 'lax', path: '/' });
  } else {
    store.delete(COOKIE_MODO_PRUEBA);
  }
}
