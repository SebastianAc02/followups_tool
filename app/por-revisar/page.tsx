import { pasosManualesPendientes } from '../db/repository';
import { requireSession } from '../lib/session';
import { AppShell } from '../ui/shell/AppShell';
import ToqueRevisar from './ToqueRevisar';

// Fase 9.1: inbox PERMANENTE de toques manuales pendientes -- a diferencia de
// /cola (que solo muestra hoy/atrasados), aca aparecen TODOS los pendientes sin
// filtro de fecha. pasosManualesPendientes() ya existe en el repository (V5.6):
// "un manual sin revisar simplemente ESPERA", nunca se descarta.
export default async function PorRevisar() {
  await requireSession();
  const pendientes = pasosManualesPendientes();

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-medium text-ink">
          {pendientes.length > 0
            ? `${pendientes.length} toque${pendientes.length === 1 ? '' : 's'} esperan tu aprobación`
            : 'Todo al día'}
        </h1>
        {pendientes.length === 0 && (
          <p className="mt-1 text-[13.5px] text-muted">No hay toques manuales pendientes de revisión.</p>
        )}
      </div>

      {pendientes.length > 0 && (
        <div className="overflow-hidden rounded-[18px] border border-line bg-card px-6 py-2">
          {pendientes.map((p) => (
            <ToqueRevisar key={p.idPasoInscripcion} item={p} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
