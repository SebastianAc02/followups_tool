'use server';

import { revalidatePath } from 'next/cache';
import { requireEscritura } from '../../lib/session';
import { esModoPrueba } from '../../lib/modo-prueba';
import { leerCookieOffsetDemo, escribirCookieOffsetDemo } from '../../lib/cookie-reloj';
import { marcarOffsetDias } from '../../lib/reloj';
import { materializarYEmpujarAhora } from '../../worker/index';

// Avanza el reloj de demo un dia y materializa/empuja los pasos que quedaron debidos con
// la nueva fecha, todo INLINE en este request (no el worker). requireEscritura y no
// requireSession: mueve el mundo (manda correos/WhatsApp de verdad), un visitante no
// puede. Blindaje extra: si por lo que sea no estamos en modo prueba, no hace nada -- el
// boton solo se muestra en prueba, pero la accion no confia en la UI.
export async function avanzarDiaDemo(): Promise<void> {
  await requireEscritura();
  if (!esModoPrueba()) return;

  const actual = await leerCookieOffsetDemo();
  await escribirCookieOffsetDemo(actual + 1);

  // El request que sigue leera la cookie nueva; pero para empujar AHORA hay que marcar el
  // offset en ESTE contexto async antes de materializar (la cookie recien escrita no se
  // relee sola dentro del mismo request).
  marcarOffsetDias(actual + 1);

  // conTracking: en modo prueba el worker no mira pruebas.db (es ciego al modo, por diseño),
  // asi que el poll de tracking -- el UNICO camino que detecta aperturas, clics y respuestas
  // POR CORREO -- no corria nunca. Sin esto se podia contestar el correo de la demo y la
  // cadencia seguia escribiendo. Corre primero, dentro de este request: ver el comentario de
  // materializarYEmpujarAhora para por que el orden importa en una sola pasada.
  await materializarYEmpujarAhora({ conTracking: true });

  revalidatePath('/', 'layout');
}

export async function reiniciarRelojDemo(): Promise<void> {
  await requireEscritura();
  await escribirCookieOffsetDemo(0);
  revalidatePath('/', 'layout');
}
