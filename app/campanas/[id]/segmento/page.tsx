import { notFound } from 'next/navigation';
import { campanaConReglas, obtenerSegmento, valoresDistintosCampo } from '../../../db/repository';
import { requireSession } from '../../../lib/session';
import { AppShell } from '../../../ui/shell/AppShell';
import { PasosWizard } from '../../nueva/PasosWizard';
import { pasosWizardCampana } from '../../nueva/pasos-wizard-items';
import { SegmentoCockpit } from './SegmentoCockpit';

// Fase 7: antes no habia forma de volver a editar el segmento de una campana ya
// creada -- una vez pasabas de Cadencia a Destinatarios, "Segmento" en la secuencia
// se quedaba como texto muerto para siempre (Sebastian lo reporto explicitamente).
// Esta pagina reusa FiltroWall/TablaCuentas/CopilotoPanel (los mismos bloques de
// NuevoSegmento) mas obtenerSegmento/actualizarSegmento, que ya existian para el
// autosave y el "volver sin perder el progreso" del wizard de creacion.
//
// Solo mientras sigue en 'borrador': editar el segmento de una campana YA lanzada
// cambiaria en silencio el criterio de inscripcion sin que nadie lo note, y ya
// inscribio gente con el criterio viejo.
export default async function SegmentoCampana({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await requireSession();
  const { id } = await params;
  const idCampana = Number(id);
  if (!Number.isInteger(idCampana) || idCampana <= 0) notFound();

  const camp = campanaConReglas(idCampana);
  if (!camp) notFound();
  if (camp.estado !== 'borrador') notFound();

  const segmento = obtenerSegmento(camp.idSegmento, sesion.idOrganizacion);
  if (!segmento) notFound();

  const opciones = {
    estado: valoresDistintosCampo('estado', sesion.idOrganizacion),
    categoria: valoresDistintosCampo('categoria', sesion.idOrganizacion),
    estado_comercial: valoresDistintosCampo('estado_comercial', sesion.idOrganizacion),
    ciudad: valoresDistintosCampo('ciudad', sesion.idOrganizacion),
    departamento: valoresDistintosCampo('departamento', sesion.idOrganizacion),
    owner: valoresDistintosCampo('owner', sesion.idOrganizacion),
    rol: valoresDistintosCampo('rol', sesion.idOrganizacion),
  };

  return (
    <AppShell>
      <PasosWizard pasos={pasosWizardCampana(idCampana, camp.idCadencia, 'Segmento')} activo="Segmento" />
      <SegmentoCockpit idCadencia={camp.idCadencia} segmento={segmento} opciones={opciones} />
    </AppShell>
  );
}
