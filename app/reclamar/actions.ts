'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '../lib/auth';
import { crearMiembroYSetOwner, crearMiembroVisitante, organizacionDeUsuario } from '../db/organizacion-repository';
import { OWNERS_ONEPAY } from '../register/owners';

// V6: id 1 = Onepay, misma constante que app/register/actions.ts.
const ID_ORGANIZACION_ONEPAY = 1;

const reclamoSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('onepay'), ownerElegido: z.enum(OWNERS_ONEPAY) }),
  z.object({ tipo: z.literal('visitante'), nombreVisitante: z.string().trim().min(1, 'Escribe tu nombre') }),
]);

export type ReclamoResultado = { ok: true } | { ok: false; error: string };

// Rescate para un usuario YA autenticado sin membresia (Task 2, plan
// 2026-07-15-embudo-real-y-registro): a diferencia de registrarUsuarioAction, aqui no se
// crea usuario -- ya existe (por eso hay sesion). Solo falta la membresia, asi que no hay
// nada que compensar/borrar si esto falla: el usuario simplemente reintenta desde /reclamar.
export async function reclamarMembresiaAction(input: unknown): Promise<ReclamoResultado> {
  const parsed = reclamoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  if (organizacionDeUsuario(session.user.id)) redirect('/');

  const userId = session.user.id;
  const datos = parsed.data;

  if (datos.tipo === 'visitante') {
    try {
      crearMiembroVisitante(datos.nombreVisitante, userId);
      return { ok: true };
    } catch (e) {
      console.error('reclamarMembresiaAction: fallo crearMiembroVisitante', e);
      return { ok: false, error: 'No se pudo completar. Intenta de nuevo.' };
    }
  }

  const creado = crearMiembroYSetOwner(ID_ORGANIZACION_ONEPAY, datos.ownerElegido, datos.ownerElegido, userId);
  if (!creado) {
    return {
      ok: false,
      error: 'Ese nombre ya tiene una cuenta. Si eres tú y perdiste el acceso, habla con Sebastián.',
    };
  }

  return { ok: true };
}
