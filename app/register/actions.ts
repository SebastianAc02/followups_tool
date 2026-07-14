'use server';

import { z } from 'zod';
import { auth } from '../lib/auth';
import { crearMiembroYSetOwner, crearMiembroVisitante } from '../db/organizacion-repository';

// V6: id 1 = Onepay, sembrada por scripts/seed_organizacion.ts. Una sola organizacion por
// ahora (fuera de alcance: multi-organizacion real).
const ID_ORGANIZACION_ONEPAY = 1;

// Lista cerrada (2026-07-14), no derivada de empresa.owner via ownersDisponibles: esa
// consulta trae basura de datos (strings vacios, owners mal normalizados con varios
// nombres juntos) y ademas listaba nombres reales a cualquier visitante anonimo antes de
// que decidiera si es del equipo. Estos 4 son el equipo real; casing EXACTO como vive en
// empresa.owner (ver comentario en schema.ts) -- "Camilo fonseca" con f minuscula es
// correcto, no un typo.
export const OWNERS_ONEPAY = ['Felipe Castro', 'Sebastian Acosta Molina', 'Thomas Schumacher', 'Camilo fonseca'] as const;

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
    crearMiembroVisitante(datos.nombreVisitante, userId);
    return { ok: true };
  }

  const creado = crearMiembroYSetOwner(ID_ORGANIZACION_ONEPAY, datos.ownerElegido, datos.ownerElegido, userId);
  if (!creado) {
    // El nombre ya esta reclamado (los 4 reales ya se registraron, por ejemplo). La cuenta
    // ya existe sin owner: session-user.ts cae al name (cola vacia, no crash), y sin
    // membresia requireSession la rechaza -- no queda en un estado a medias silencioso.
    return {
      ok: false,
      error: 'Ese nombre ya tiene una cuenta. Si eres tú y perdiste el acceso, habla con Sebastián.',
    };
  }

  return { ok: true };
}
