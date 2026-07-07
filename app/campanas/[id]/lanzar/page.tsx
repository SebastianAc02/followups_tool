import { notFound } from 'next/navigation';
import { campanaParaLanzar, toquesGlobalesHoy } from '../../../db/repository';
import { requireSession } from '../../../lib/session';
import { AppShell } from '../../../ui/shell/AppShell';
import { LanzarCockpit } from './LanzarCockpit';

// Fase 8 (V6 Lanzar): standalone, mismo patron que /campanas/[id]/reglas y
// /campanas/[id]/destinatarios -- se llega por url directa a una campana ya existente.
// La carga global (toquesGlobalesHoy) se resuelve server-side de una vez; el cliente
// solo la vuelve a pedir si el usuario cambia el tope y quiere ver el efecto (accion
// separada, ver actions.ts).
export default async function LanzarCampana({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const idCampana = Number(id);
  if (!Number.isInteger(idCampana) || idCampana <= 0) notFound();

  const camp = campanaParaLanzar(idCampana);
  if (!camp) notFound();

  const cargaGlobal = toquesGlobalesHoy();

  return (
    <AppShell>
      <LanzarCockpit campanaInicial={camp} cargaGlobalInicial={cargaGlobal} />
    </AppShell>
  );
}
