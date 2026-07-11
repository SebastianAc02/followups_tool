'use server';

import { revalidatePath } from 'next/cache';
import { aprobarPasoManual, completarContactoYResolver, agregarContactoYResolver } from '../db/repository';
import { requireSession } from '../lib/session';

// Fase 9.1: aprobar un manual (correo/whatsapp) desde el cockpit de /llamada. La fecha
// de aprobacion es la fecha REAL del servidor al momento del click (no la
// fechaProgramada original) -- mismo criterio que aprobarPasoManualAction en
// app/actions.ts (la cola de hoy), asi el motor de fechas re-ancla el siguiente paso
// desde cuando Sebastian de verdad lo mando, no desde cuando estaba agendado.
// Sesion 2026-07-10: el nombre y el archivo quedan (varios callers en /llamada ya lo
// importan de aca), pero ya NO vive en /por-revisar -- ver CadenciasHoy.tsx.
export type AprobarDesdeInboxResultado = { ok: true } | { ok: false; error: string };

export async function aprobarDesdeInboxAction(
  idPasoInscripcion: number,
  cuerpoFinal?: string,
): Promise<AprobarDesdeInboxResultado> {
  await requireSession();
  try {
    const hoy = new Date().toISOString();
    aprobarPasoManual(idPasoInscripcion, hoy, cuerpoFinal);
    revalidatePath('/cola');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo aprobar el toque' };
  }
}

export type ResolverBloqueadaResultado = { ok: true } | { ok: false; error: string };

// Completa el correo/telefono de un contacto YA existente de la empresa y activa la
// inscripcion bloqueada con ese contacto.
export async function completarContactoAction(
  idInscripcion: number,
  idContacto: number,
  datos: { email?: string; telefono?: string },
): Promise<ResolverBloqueadaResultado> {
  await requireSession();
  try {
    completarContactoYResolver(idInscripcion, idContacto, datos);
    revalidatePath('/por-revisar');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar el contacto' };
  }
}

// La empresa no tiene NINGUN contacto: crea uno de cero y activa la inscripcion con el.
export async function agregarContactoAction(
  idInscripcion: number,
  idEmpresa: string,
  datos: { nombre?: string; email?: string; telefono?: string },
): Promise<ResolverBloqueadaResultado> {
  await requireSession();
  try {
    agregarContactoYResolver(idInscripcion, idEmpresa, datos);
    revalidatePath('/por-revisar');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo crear el contacto' };
  }
}
