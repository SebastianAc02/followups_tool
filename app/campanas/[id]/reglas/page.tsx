import { notFound } from 'next/navigation';
import { campanaConReglas, conteosReadiness } from '../../../db/repository';
import { requireSession } from '../../../lib/session';
import { AppShell } from '../../../ui/shell/AppShell';
import { CampanaSubNav } from '../CampanaSubNav';
import { subNavItemsCampana } from '../subnav-items';
import { PasosWizard } from '../../nueva/PasosWizard';
import { pasosWizardCampana } from '../../nueva/pasos-wizard-items';
import { ReglasCockpit } from './ReglasCockpit';

// Fase 5 (vista Reglas): no es uno de los 5 pasos del wizard (Segmento/Cadencia/
// Destinatarios/Preview/Lanzar) -- se llega aca desde el link "Cambiar regla" de
// Destinatarios, asi que mientras la campana sigue en 'borrador' el header sigue
// resaltando "Destinatarios" (es de ahi de donde se vino, Reglas es un ajuste
// puntual, no una parada propia) en vez de saltar a los tabs de CampanaSubNav.
export default async function ReglasCampana({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await requireSession();
  const { id } = await params;
  const idCampana = Number(id);
  if (!Number.isInteger(idCampana) || idCampana <= 0) notFound();

  const camp = campanaConReglas(idCampana);
  if (!camp) notFound();

  const conteosIniciales = conteosReadiness(camp.definicionSegmento, camp.canalesRequeridos, camp.reglaFaltante, sesion.idOrganizacion);
  const esBorrador = camp.estado === 'borrador';

  return (
    <AppShell>
      {esBorrador ? (
        <PasosWizard pasos={pasosWizardCampana(camp.idCampana, camp.idCadencia, 'Destinatarios', false)} activo="Destinatarios" />
      ) : (
        <CampanaSubNav items={subNavItemsCampana(camp.idCampana, camp.idCadencia)} />
      )}
      <ReglasCockpit
        idCampana={camp.idCampana}
        nombre={camp.nombre}
        reglaGuardada={camp.reglaFaltante}
        conteosIniciales={conteosIniciales}
      />
    </AppShell>
  );
}
