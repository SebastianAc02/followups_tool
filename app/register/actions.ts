'use server';

import { z } from 'zod';
import { auth } from '../lib/auth';
import { crearMiembroYSetOwner, crearMiembroVisitante, borrarUsuario } from '../db/organizacion-repository';
import { OWNERS_ONEPAY } from './owners';

// V6: id 1 = Onepay, sembrada por scripts/seed_organizacion.ts. Una sola organizacion por
// ahora (fuera de alcance: multi-organizacion real).
const ID_ORGANIZACION_ONEPAY = 1;

const credencialesSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'La contraseña necesita al menos 8 caracteres'),
});

const registroSchema = z.discriminatedUnion('tipo', [
  credencialesSchema.extend({ tipo: z.literal('onepay'), ownerElegido: z.enum(OWNERS_ONEPAY) }),
  credencialesSchema.extend({ tipo: z.literal('visitante'), nombreVisitante: z.string().trim().min(1, 'Escribe tu nombre') }),
]);

export type RegistroResultado = { ok: true } | { ok: false; error: string };

export async function registrarUsuarioAction(input: unknown): Promise<RegistroResultado> {
  const parsed = registroSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }
  const datos = parsed.data;

  let userId: string;
  try {
    const nombre = datos.tipo === 'onepay' ? datos.ownerElegido : datos.nombreVisitante;
    const res = await auth.api.signUpEmail({ body: { email: datos.email, password: datos.password, name: nombre } });
    userId = res.user.id;
  } catch (e) {
    console.error('registrarUsuarioAction: fallo signUpEmail', e);
    return { ok: false, error: 'No se pudo crear la cuenta (correo ya registrado o clave muy corta).' };
  }

  if (datos.tipo === 'visitante') {
    try {
      crearMiembroVisitante(datos.nombreVisitante, userId);
      return { ok: true };
    } catch (e) {
      // signUpEmail ya dejo al usuario autenticado antes de esto. Si la membresia truena,
      // sin esta compensacion quedaria sin organizacion para siempre: requireSession lo
      // entierra con un throw y el correo ya usado bloquea reintentar.
      console.error('registrarUsuarioAction: fallo crearMiembroVisitante, revirtiendo usuario', e);
      borrarUsuario(userId);
      return { ok: false, error: 'No se pudo completar el registro. Intenta de nuevo.' };
    }
  }

  const creado = crearMiembroYSetOwner(ID_ORGANIZACION_ONEPAY, datos.ownerElegido, datos.ownerElegido, userId);
  if (!creado) {
    // El nombre ya esta reclamado (los 4 reales ya se registraron, por ejemplo). Ademas de
    // rechazar, borramos el usuario recien creado: si no, queda autenticado sin membresia
    // y requireSession lo entierra (500 permanente, sin poder reintentar con ese correo).
    borrarUsuario(userId);
    return {
      ok: false,
      error: 'Ese nombre ya tiene una cuenta. Si eres tú y perdiste el acceso, habla con Sebastián.',
    };
  }

  return { ok: true };
}
