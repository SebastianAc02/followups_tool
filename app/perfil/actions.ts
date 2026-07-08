'use server';

import { z } from 'zod';
import { requireSession } from '../lib/session';
import { preferenciasAdapter } from '../lib/perfil';
import { COLOR_AVATAR_OPCIONES } from '../ui/shell/avatar-colores';
import { VISTA_INICIO_OPCIONES } from '../ui/shell/vista-inicio';

const idsColorAvatar = COLOR_AVATAR_OPCIONES.map((o) => o.id) as [string, ...string[]];
const idsVistaInicio = VISTA_INICIO_OPCIONES.map((o) => o.id) as [string, ...string[]];

const preferenciasSchema = z.object({
  colorAvatar: z.enum(idsColorAvatar).optional(),
  vistaInicio: z.enum(idsVistaInicio).optional(),
  cargo: z.string().max(80, 'Máximo 80 caracteres').optional(),
  telefono: z.string().max(30, 'Máximo 30 caracteres').optional(),
});

export type GuardarPreferenciasResultado = { ok: true } | { ok: false; error: string };

// El id de usuario SIEMPRE sale de la sesion server-side (requireSession), nunca del
// input del cliente: nadie puede escribir preferencias de otro usuario mandando un
// idUser distinto en el body.
export async function guardarPreferenciasAction(input: unknown): Promise<GuardarPreferenciasResultado> {
  const parsed = preferenciasSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };
  }

  const usuario = await requireSession();
  await preferenciasAdapter.guardar(usuario.id, parsed.data);
  return { ok: true };
}
