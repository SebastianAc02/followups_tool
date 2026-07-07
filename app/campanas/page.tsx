import { listarCampanas, listarInscritasHub, metricasHub } from '../db/repository';
import { requireSession } from '../lib/session';
import { AppShell } from '../ui/shell/AppShell';
import { HubHeader } from './HubHeader';
import { CampanasGrid } from './CampanasGrid';
import { InscritasTable } from './InscritasTable';

export default async function Campanas() {
  await requireSession();
  const campanas = listarCampanas();
  const metricas = metricasHub();
  const inscritas = listarInscritasHub();

  return (
    <AppShell>
      <HubHeader metricas={metricas} />
      <CampanasGrid campanas={campanas} />
      <InscritasTable inscritas={inscritas} />
    </AppShell>
  );
}
