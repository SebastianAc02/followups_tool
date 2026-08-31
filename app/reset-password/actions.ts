'use server';

import { z } from 'zod';
import { confirmarReset } from '../lib/password-reset';

const resetSchema = z.object({
  token: z.string().min(1),
  nuevaPassword: z.string().min(8, 'La contraseña necesita al menos 8 caracteres'),
});

export type ResetPasswordResultado = { ok: true } | { ok: false; error: string };

export async function confirmarResetPasswordAction(input: unknown): Promise<ResetPasswordResultado> {
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const res = await confirmarReset(parsed.data.token, parsed.data.nuevaPassword);
  if (res.ok) return { ok: true };

  const mensajes: Record<typeof res.motivo, string> = {
    token_invalido: 'Este link no es válido. Pide uno nuevo desde "Olvidé mi password".',
    token_expirado: 'Este link ya venció (dura 45 minutos). Pide uno nuevo.',
    token_usado: 'Este link ya se usó. Pide uno nuevo si necesitas cambiar la password de nuevo.',
  };
  return { ok: false, error: mensajes[res.motivo] };
}
