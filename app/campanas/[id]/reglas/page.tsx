import { notFound } from 'next/navigation';
import { campanaConReglas, conteosReadiness } from '../../../db/repository';
import { requireSession } from '../../../lib/session';
import { AppShell } from '../../../ui/shell/AppShell';
import { ReglasCockpit } from './ReglasCockpit';

// Fase 5 (vista Reglas): standalone, no colgada de /campanas/nueva. El wizard de
// creacion todavia esta en construccion en paralelo (otro agente); esta pantalla se
// llega por url directa a una campana ya existente, igual que /cadencias/[id] es
// standalone hoy sin estar linkeada desde ningun flujo todavia. Cuando el wizard
// necesite este paso, solo tiene que enlazar aca — no hay nada que reestructurar.
export default async function ReglasCampana({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const idCampana = Number(id);
  if (!Number.isInteger(idCampana) || idCampana <= 0) notFound();

  const camp = campanaConReglas(idCampana);
  if (!camp) notFound();

  const conteosIniciales = conteosReadiness(camp.definicionSegmento, camp.canalesRequeridos, camp.reglaFaltante);

  return (
    <AppShell>
      <ReglasCockpit
        idCampana={camp.idCampana}
        nombre={camp.nombre}
        reglaGuardada={camp.reglaFaltante}
        conteosIniciales={conteosIniciales}
      />
    </AppShell>
  );
}
