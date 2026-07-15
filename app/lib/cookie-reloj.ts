import { cookies } from 'next/headers';

// Cookie de SESION (sin maxAge): muere al cerrar el navegador, igual que cookie-modo.ts.
// Un reloj de demo que se queda pegado en dia +12 sin que te des cuenta es peor que uno
// que se resetea. httpOnly: lo escribe el servidor (server action), no JS del cliente.
export const COOKIE_OFFSET_DEMO = 'reloj_demo_offset';

export async function leerCookieOffsetDemo(): Promise<number> {
  const store = await cookies();
  const raw = store.get(COOKIE_OFFSET_DEMO)?.value;
  const n = raw ? Number(raw) : 0;
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export async function escribirCookieOffsetDemo(dias: number): Promise<void> {
  const store = await cookies();
  if (dias > 0) {
    store.set(COOKIE_OFFSET_DEMO, String(dias), { httpOnly: true, sameSite: 'lax', path: '/' });
  } else {
    store.delete(COOKIE_OFFSET_DEMO);
  }
}
