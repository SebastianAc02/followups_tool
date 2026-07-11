import { notFound } from 'next/navigation';
import { campanaParaLanzar, toquesGlobalesHoy, canalesDeCadencia } from '../../../db/repository';
import { requireSession } from '../../../lib/session';
import { AppShell } from '../../../ui/shell/AppShell';
import { CampanaSubNav } from '../CampanaSubNav';
import { subNavItemsCampana } from '../subnav-items';
import { PasosWizard } from '../../nueva/PasosWizard';
import { pasosWizardCampana } from '../../nueva/pasos-wizard-items';
import { LanzarCockpit } from './LanzarCockpit';

// Fase 8 (V6 Lanzar): standalone, mismo patron que /campanas/[id]/reglas y
// /campanas/[id]/destinatarios -- se llega por url directa a una campana ya existente.
// La carga global (toquesGlobalesHoy) se resuelve server-side de una vez; el cliente
// solo la vuelve a pedir si el usuario cambia el tope y quiere ver el efecto (accion
// separada, ver actions.ts).
//
// Header: sigue la secuencia del wizard mientras la campana este en 'borrador' (aun
// no se lanzo), no los tabs -- ver nota igual en destinatarios/page.tsx.
export default async function LanzarCampana({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await requireSession();
  const { id } = await params;
  const idCampana = Number(id);
  if (!Number.isInteger(idCampana) || idCampana <= 0) notFound();

  const camp = campanaParaLanzar(idCampana, sesion.idOrganizacion);
  if (!camp) notFound();

  const cargaGlobal = toquesGlobalesHoy();
  const esBorrador = camp.estado === 'borrador';
  const canalesPrueba = canalesDeCadencia(camp.idCadencia).filter(
    (c): c is 'correo' | 'whatsapp' => c === 'correo' || c === 'whatsapp',
  );

  return (
    <AppShell>
      {esBorrador ? (
        <PasosWizard pasos={pasosWizardCampana(camp.idCampana, camp.idCadencia, 'Lanzar')} activo="Lanzar" />
      ) : (
        <CampanaSubNav items={subNavItemsCampana(camp.idCampana, camp.idCadencia)} />
      )}
      <LanzarCockpit campanaInicial={camp} cargaGlobalInicial={cargaGlobal} canalesPrueba={canalesPrueba} />
    </AppShell>
  );
}
