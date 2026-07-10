import { notFound } from 'next/navigation';
import { campanaConReglas, getCadencia, muestraDestinatarioDeSegmento } from '../../../db/repository';
import { requireSession } from '../../../lib/session';
import { AppShell } from '../../../ui/shell/AppShell';
import { CampanaSubNav } from '../CampanaSubNav';
import { subNavItemsCampana } from '../subnav-items';
import { PasosWizard } from '../../nueva/PasosWizard';
import { pasosWizardCampana } from '../../nueva/pasos-wizard-items';
import { PreviewCockpit } from './PreviewCockpit';

// Fase 7: "Preview" como paso propio del flujo (penultimo, entre Destinatarios y
// Lanzar) -- antes vivia embebido dentro del paso Cadencia de la creacion, sin ruta
// ni lugar donde volver a verlo despues. Reusa PreviewCinematico (ya portado de la
// vista V5) con el mismo destinatario de muestra que se usaba ahi (real del
// segmento, no inventado) y los pasos actuales de la cadencia via getCadencia.
//
// Header: sigue la secuencia del wizard mientras la campana este en 'borrador', no
// los tabs de una campana ya lanzada -- ver nota igual en destinatarios/page.tsx.
export default async function PreviewCampana({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await requireSession();
  const { id } = await params;
  const idCampana = Number(id);
  if (!Number.isInteger(idCampana) || idCampana <= 0) notFound();

  const camp = campanaConReglas(idCampana);
  if (!camp) notFound();

  const datosCadencia = getCadencia(camp.idCadencia);
  const muestra = muestraDestinatarioDeSegmento(camp.idSegmento, sesion.idOrganizacion);
  const esBorrador = camp.estado === 'borrador';

  return (
    <AppShell>
      {esBorrador ? (
        <PasosWizard pasos={pasosWizardCampana(idCampana, camp.idCadencia, 'Preview')} activo="Preview" />
      ) : (
        <CampanaSubNav items={subNavItemsCampana(idCampana, camp.idCadencia)} />
      )}
      <PreviewCockpit idCampana={idCampana} nombreCampana={camp.nombre} pasos={datosCadencia?.pasos ?? []} muestra={muestra} />
    </AppShell>
  );
}
