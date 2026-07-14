'use server';

import { requireSession } from '../lib/session';
import { leerTablero, guardarTablero as guardarTableroRepo } from '../db/panel-tablero-repository';
import { parse, serialize, tableroDefault, type TableroItem } from '../core/panel/tablero';

// Ambas rechazan si el usuario no es admin -- /panel entero es admin-only (gate ya en
// page.tsx, pero un server action se puede invocar directo, asi que se repite aca).
export async function cargarTablero(): Promise<TableroItem[]> {
  const usuario = await requireSession();
  if (!usuario.admin) throw new Error('Solo un admin puede ver el tablero del panel');

  const fila = leerTablero(usuario.id);
  if (!fila?.layout) return tableroDefault();

  const layout = parse(fila.layout);
  return layout.length > 0 ? layout : tableroDefault();
}

export async function guardarTablero(layout: TableroItem[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const usuario = await requireSession();
  if (!usuario.admin) return { ok: false, error: 'Solo un admin puede editar el tablero del panel' };

  guardarTableroRepo(usuario.id, serialize(layout));
  return { ok: true };
}
