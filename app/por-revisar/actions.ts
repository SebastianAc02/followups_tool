'use server';

import { revalidatePath } from 'next/cache';
import { aprobarPasoManual } from '../db/repository';
import { requireSession } from '../lib/session';

// Fase 9.1: aprobar desde el inbox permanente. La fecha de aprobacion es la fecha
// REAL del servidor al momento del click (no la fechaProgramada original) -- mismo
// criterio que aprobarPasoManualAction en app/actions.ts (la cola de hoy), asi el
// motor de fechas re-ancla el siguiente paso desde cuando Sebastian de verdad lo
// mando, no desde cuando estaba agendado.
export type AprobarDesdeInboxResultado = { ok: true } | { ok: false; error: string };

export async function aprobarDesdeInboxAction(
  idPasoInscripcion: number,
  cuerpoFinal?: string,
): Promise<AprobarDesdeInboxResultado> {
  await requireSession();
  try {
    const hoy = new Date().toISOString();
    aprobarPasoManual(idPasoInscripcion, hoy, cuerpoFinal);
    revalidatePath('/por-revisar');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo aprobar el toque' };
  }
}
