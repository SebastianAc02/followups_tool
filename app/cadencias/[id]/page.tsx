import { notFound } from 'next/navigation';
import { getCadencia, campanaPorCadencia } from '../../db/repository';
import { requireSession } from '../../lib/session';
import { AppShell } from '../../ui/shell/AppShell';
import { CampanaSubNav } from '../../campanas/[id]/CampanaSubNav';
import { subNavItemsCampana } from '../../campanas/[id]/subnav-items';
import { PasosWizard } from '../../campanas/nueva/PasosWizard';
import { pasosWizardCampana } from '../../campanas/nueva/pasos-wizard-items';
import { CadenciaCockpit } from './CadenciaCockpit';

// Fase 4 (cockpit de campanas): V3 Cadencia como pantalla de plantilla — arma tu
// cadencia (toque/dia/canal/aprobacion) + tu cadencia por pasos (copy resuelto).
// getCadencia ya trae cabecera + pasos con su version default; esta pagina solo
// valida el id y delega el resto al cliente.
//
// Header de campana: esta ruta tambien la usa el constructor de plantillas suelto
// (sin campana), asi que ningun header de campana aparece si esta cadencia no
// pertenece a una campana real (campanaPorCadencia) -- es una plantilla de
// biblioteca y no hay a donde volver. Si pertenece, el header depende del estado:
// 'borrador' sigue siendo la secuencia del wizard (PasosWizard) para no saltar a los
// tabs a mitad de la creacion (Sebastian lo reporto explicitamente); ya lanzada usa
// CampanaSubNav. El editor de CadenciaCockpit en si es el mismo en los dos casos
// (una sola vista con grid + secuencia, Sebastian pidio no partirla en dos).
export default async function CadenciaDetalle({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const idCadencia = Number(id);
  if (!Number.isInteger(idCadencia) || idCadencia <= 0) notFound();

  const datos = getCadencia(idCadencia);
  if (!datos) notFound();

  const camp = campanaPorCadencia(idCadencia);
  const esBorrador = camp?.estado === 'borrador';

  return (
    <AppShell>
      {camp &&
        (esBorrador ? (
          <PasosWizard pasos={pasosWizardCampana(camp.idCampana, idCadencia, 'Cadencia')} activo="Cadencia" />
        ) : (
          <CampanaSubNav items={subNavItemsCampana(camp.idCampana, idCadencia)} />
        ))}
      <CadenciaCockpit
        idCadencia={idCadencia}
        nombre={datos.cadencia.nombre}
        pasos={datos.pasos}
        idCampanaBorrador={esBorrador ? camp.idCampana : undefined}
      />
    </AppShell>
  );
}
