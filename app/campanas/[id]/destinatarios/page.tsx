import { notFound } from 'next/navigation';
import { campanaParaPreview, previsualizarInscripcionCampana } from '../../../db/repository';
import { requireSession } from '../../../lib/session';
import { AppShell } from '../../../ui/shell/AppShell';
import { DestinatariosCockpit } from './DestinatariosCockpit';

// Fase 6 (V4 Destinatarios): standalone, mismo patron que /campanas/[id]/reglas --
// se llega por url directa a una campana ya existente. El calculo inicial se hace
// server-side (evita el parpadeo de un primer fetch client-side); la accion solo se
// vuelve a llamar si Sebastian recarga el preview manualmente.
export default async function DestinatariosCampana({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const idCampana = Number(id);
  if (!Number.isInteger(idCampana) || idCampana <= 0) notFound();

  const camp = campanaParaPreview(idCampana);
  if (!camp) notFound();

  const filas = previsualizarInscripcionCampana(idCampana) ?? [];

  return (
    <AppShell>
      <DestinatariosCockpit campana={camp} filasIniciales={filas} />
    </AppShell>
  );
}
