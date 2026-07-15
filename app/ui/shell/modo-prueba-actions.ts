'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '../../lib/session';
import { escribirCookieModoPrueba } from '../../lib/cookie-modo';

// requireSession y no requireEscritura: cambiar de modo no escribe en ninguna base, solo
// cambia una cookie. Un visitante puede mirar el modo prueba y sigue en solo-lectura (el
// candado actua independiente de contra que base corre la request).
export async function alternarModoPrueba(valor: boolean): Promise<void> {
  await requireSession();
  await escribirCookieModoPrueba(valor);
  // 'layout': el shell entero (sidebar, contadores, top bar) sale de la otra base.
  revalidatePath('/', 'layout');
}
