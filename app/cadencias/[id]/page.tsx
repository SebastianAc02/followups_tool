import { notFound } from 'next/navigation';
import { getCadencia } from '../../db/repository';
import { requireSession } from '../../lib/session';
import { AppShell } from '../../ui/shell/AppShell';
import { CadenciaCockpit } from './CadenciaCockpit';

// Fase 4 (cockpit de campanas): V3 Cadencia como pantalla de plantilla — arma tu
// cadencia (toque/dia/canal/aprobacion) + tu cadencia por pasos (copy resuelto).
// getCadencia ya trae cabecera + pasos con su version default; esta pagina solo
// valida el id y delega el resto al cliente.
export default async function CadenciaDetalle({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const idCadencia = Number(id);
  if (!Number.isInteger(idCadencia) || idCadencia <= 0) notFound();

  const datos = getCadencia(idCadencia);
  if (!datos) notFound();

  return (
    <AppShell>
      <CadenciaCockpit idCadencia={idCadencia} nombre={datos.cadencia.nombre} pasos={datos.pasos} />
    </AppShell>
  );
}
