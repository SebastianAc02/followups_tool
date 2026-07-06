'use server';

import { z } from 'zod';
import { auth } from '../lib/auth';
import { miembroLibrePorId, reclamarMiembroYSetOwner } from '../db/organizacion-repository';

const registroSchema = z.object({
  idMiembro: z.coerce.number().int().positive(),
  email: z.string().email(),
  password: z.string().min(8, 'La contraseña necesita al menos 8 caracteres'),
});

export type RegistroResultado = { ok: true } | { ok: false; error: string };

export async function registrarUsuarioAction(input: unknown): Promise<RegistroResultado> {
  const parsed = registroSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const { idMiembro, email, password } = parsed.data;

  const miembro = miembroLibrePorId(idMiembro);
  if (!miembro) {
    return { ok: false, error: 'Ese nombre ya no está disponible. Recarga la página.' };
  }

  let userId: string;
  try {
    const res = await auth.api.signUpEmail({ body: { email, password, name: miembro.nombreDisplay } });
    userId = res.user.id;
  } catch (e) {
    console.error('registrarUsuarioAction: fallo signUpEmail', e);
    return { ok: false, error: 'No se pudo crear la cuenta (correo ya registrado o clave muy corta).' };
  }

  const reclamado = reclamarMiembroYSetOwner(idMiembro, userId, miembro.ownerCanonico);
  if (!reclamado) {
    // Alguien mas gano la carrera por este nombre justo despues del check de arriba. La
    // cuenta ya existe sin owner: session-user.ts cae al name (cola vacia, no crash).
    return {
      ok: false,
      error: 'Alguien más tomó ese nombre justo antes que tú. Tu cuenta se creó, pide que te asignen el nombre a mano.',
    };
  }

  return { ok: true };
}
