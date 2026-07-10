import { notFound } from 'next/navigation';
import { campanaParaPreview, previsualizarInscripcionCampana, listarInscritasHub } from '../../../db/repository';
import { requireSession } from '../../../lib/session';
import { AppShell } from '../../../ui/shell/AppShell';
import { CampanaSubNav } from '../CampanaSubNav';
import { subNavItemsCampana } from '../subnav-items';
import { PasosWizard } from '../../nueva/PasosWizard';
import { pasosWizardCampana } from '../../nueva/pasos-wizard-items';
import { DestinatariosCockpit } from './DestinatariosCockpit';

// Fase 6 (V4 Destinatarios): standalone, mismo patron que /campanas/[id]/reglas --
// se llega por url directa a una campana ya existente. El calculo inicial se hace
// server-side (evita el parpadeo de un primer fetch client-side); la accion solo se
// vuelve a llamar si Sebastian recarga el preview manualmente.
//
// Preview vs. factura real: mientras la campana sigue en 'borrador', el preview de
// usar-y-tirar (previsualizarInscripcionCampana) es lo unico que existe. En cuanto
// ya se lanzo (inscribirCampana corrio, estado != 'borrador'), esa cuenta ya no
// importa -- lo que hay que mostrar es quien quedo inscrito de verdad.
//
// Header: mientras sigue en 'borrador' (se llego aca desde Cadencia en creacion),
// sigue siendo la secuencia del wizard (PasosWizard) -- saltar a los tabs de
// CampanaSubNav a mitad de la creacion es justo lo que Sebastian reporto como
// confuso ("me saca de un layout a meterme a otro de manera random").
export default async function DestinatariosCampana({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await requireSession();
  const { id } = await params;
  const idCampana = Number(id);
  if (!Number.isInteger(idCampana) || idCampana <= 0) notFound();

  const camp = campanaParaPreview(idCampana);
  if (!camp) notFound();

  const filas = previsualizarInscripcionCampana(idCampana, sesion.idOrganizacion) ?? [];
  const esBorrador = camp.estado === 'borrador';
  const inscritasReales = esBorrador ? null : listarInscritasHub(idCampana);

  return (
    <AppShell>
      {esBorrador ? (
        <PasosWizard pasos={pasosWizardCampana(camp.idCampana, camp.idCadencia, 'Destinatarios')} activo="Destinatarios" />
      ) : (
        <CampanaSubNav items={subNavItemsCampana(camp.idCampana, camp.idCadencia)} />
      )}
      <DestinatariosCockpit campana={camp} filasIniciales={filas} inscritasReales={inscritasReales} />
    </AppShell>
  );
}
