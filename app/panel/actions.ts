'use server';

import { requireSession } from '../lib/session';
import { leerTablero, guardarTablero as guardarTableroRepo } from '../db/panel-tablero-repository';
import { parse, serialize, tableroDefault, type TableroItem } from '../core/panel/tablero';

// Fase 4 (plan-produccion-cro-campana.md, tarea 11): /panel se abre a todos los usuarios
// autenticados, ya no admin-only (ver el comentario largo en page.tsx). Se mantiene el
// requireSession -- sigue haciendo falta sesion valida -- pero el chequeo de
// usuario.admin se quita de las dos funciones: panel_tablero.id_user es un layout
// PERSONAL (PK id_user), cada usuario solo puede leer/escribir el suyo propio via su
// propio usuario.id, nunca el de otro.
export async function cargarTablero(): Promise<TableroItem[]> {
  const usuario = await requireSession();

  const fila = leerTablero(usuario.id);
  if (!fila?.layout) return tableroDefault();

  const layout = parse(fila.layout);
  return layout.length > 0 ? layout : tableroDefault();
}

export async function guardarTablero(layout: TableroItem[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const usuario = await requireSession();

  guardarTableroRepo(usuario.id, serialize(layout));
  return { ok: true };
}
