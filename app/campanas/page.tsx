import { listarCampanas, metricasHub } from '../db/repository';
import { requireSession } from '../lib/session';
import { AppShell } from '../ui/shell/AppShell';
import { HubHeader } from './HubHeader';
import { CampanasGrid } from './CampanasGrid';

// La tabla de "Empresas inscritas" vivia aca (vista global de cualquier campana),
// pero mezclaba el dashboard de campanas con el detalle de UNA campana. Ahora vive
// en /campanas/[id]/destinatarios (listarInscritasHub(idCampana)), que es donde
// tiene contexto -- ver esa pagina y DestinatariosCockpit.
export default async function Campanas() {
  await requireSession();
  const campanas = listarCampanas();
  const metricas = metricasHub();

  return (
    <AppShell>
      <HubHeader metricas={metricas} />
      <CampanasGrid campanas={campanas} />
    </AppShell>
  );
}
