'use server';

import { z } from 'zod';
import { auth } from '../lib/auth';
import { crearMiembroYSetOwner } from '../db/organizacion-repository';

// V6: id 1 = Onepay, sembrada por scripts/seed_organizacion.ts. Una sola organizacion por
// ahora (fuera de alcance: multi-organizacion real).
const ID_ORGANIZACION_ONEPAY = 1;

const registroSchema = z.object({
  ownerElegido: z.string().trim().min(1, 'Elige tu nombre'),
  email: z.string().email(),
  password: z.string().min(8, 'La contraseña necesita al menos 8 caracteres'),
});

export type RegistroResultado = { ok: true } | { ok: false; error: string };

export async function registrarUsuarioAction(input: unknown): Promise<RegistroResultado> {
  const parsed = registroSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { ownerElegido, email, password } = parsed.data;

  let userId: string;
  try {
    const res = await auth.api.signUpEmail({ body: { email, password, name: ownerElegido } });
    userId = res.user.id;
  } catch (e) {
    console.error('registrarUsuarioAction: fallo signUpEmail', e);
    return { ok: false, error: 'No se pudo crear la cuenta (correo ya registrado o clave muy corta).' };
  }

  const creado = crearMiembroYSetOwner(ID_ORGANIZACION_ONEPAY, ownerElegido, ownerElegido, userId);
  if (!creado) {
    // Alguien mas eligio el mismo owner justo antes. La cuenta ya existe sin owner:
    // session-user.ts cae al name (cola vacia, no crash).
    return {
      ok: false,
      error: 'Alguien más eligió ese nombre justo antes que tú. Tu cuenta se creó, pide que te asignen el nombre a mano.',
    };
  }

  return { ok: true };
}
