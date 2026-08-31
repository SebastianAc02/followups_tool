'use server';

import { z } from 'zod';
import { generarSolicitudReset, logueaLinkDeResetParaPruebas } from '../lib/password-reset';

const emailSchema = z.string().email();

export type SolicitudResetResultado = { ok: true; urlResetSoloDev?: string };

// Siempre devuelve ok:true (con o sin urlResetSoloDev) haya o no cuenta con ese correo: el
// mensaje al usuario es identico a proposito ("si el correo existe, te llega un link"), para
// no convertir este formulario en un oraculo de que correos estan registrados en la
// herramienta. urlResetSoloDev solo viaja fuera de produccion, para poder probar el flujo
// sin correo real -- ver logueaLinkDeResetParaPruebas en app/lib/password-reset.ts.
export async function solicitarResetPasswordAction(input: unknown): Promise<SolicitudResetResultado> {
  const parsed = emailSchema.safeParse(typeof input === 'object' && input && 'email' in input ? (input as { email: unknown }).email : input);
  if (!parsed.success) {
    // Email con formato invalido: mismo mensaje generico, no se distingue del caso "no existe".
    return { ok: true };
  }

  const { existeCuenta, urlReset } = await generarSolicitudReset(parsed.data);

  if (existeCuenta && urlReset) {
    logueaLinkDeResetParaPruebas(parsed.data, urlReset);
    if (process.env.NODE_ENV !== 'production') {
      return { ok: true, urlResetSoloDev: urlReset };
    }
  }

  return { ok: true };
}
