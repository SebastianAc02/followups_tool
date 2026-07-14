import { redirect } from 'next/navigation';
import { requireSession } from '../lib/session';
import { AppShell } from '../ui/shell/AppShell';
import { ventanaPromedio, promedioDiario } from '../core/actividad';
import {
  contarToquesEnRango,
  leadsTocadosEnRango,
  toquesPorCanal,
  toquesPorResultado,
  campanasActivas,
  inscripcionesActivas,
  empresasPorCadencia,
  ownersConToques,
} from '../db/repository';
import { WIDGETS } from '../core/panel/widgets';
import { resolverMetrica, type MetricaValor } from '../core/panel/metricas';
import { cargarTablero } from './actions';
import { PanelClient } from './PanelClient';

// searchParams: owner/desde/hasta cablean el filtro real de la Tarea 14 (owner existe
// en empresa.owner; fecha ya usa la ventana de actividad.ts). stage/segmento/monto no
// tienen fuente hoy y quedan chips visuales deshabilitados en Cockpit.tsx.
export default async function Panel({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string; desde?: string; hasta?: string }>;
}) {
  const usuario = await requireSession();
  if (!usuario.admin) redirect('/'); // sin flag admin, la ruta no existe para el usuario

  const params = await searchParams;
  const hoy = new Date().toISOString().slice(0, 10);
  const ventana = ventanaPromedio(hoy);
  const desde = params.desde || ventana.desde;
  const hasta = params.hasta || ventana.hasta;
  const owner = params.owner || undefined;

  const toquesTotal = contarToquesEnRango(desde, hasta, owner);
  const datos = {
    toquesTotal,
    promedioDiario: promedioDiario(toquesTotal),
    leadsTocados: leadsTocadosEnRango(desde, hasta, owner),
    toquesPorCanal: toquesPorCanal(desde, hasta, owner),
    toquesPorResultado: toquesPorResultado(desde, hasta, owner),
    campanasActivas: campanasActivas(),
    inscripcionesActivas: inscripcionesActivas(),
    empresasPorCadencia: empresasPorCadencia(),
  };

  // Se resuelve la metrica de TODOS los widgets del catalogo (no solo los del tablero
  // actual) porque la biblioteca del Constructor tambien necesita mostrar "sin datos"
  // en las tarjetas que aun no estan en el lienzo.
  const metricas: Record<string, MetricaValor> = {};
  for (const w of WIDGETS) metricas[w.id] = resolverMetrica(w.dataSource, datos);

  const tablero = await cargarTablero();
  const owners = ownersConToques();

  return (
    <AppShell>
      <PanelClient
        tablero={tablero}
        metricas={metricas}
        email={usuario.email}
        desde={desde}
        hasta={hasta}
        owner={owner}
        owners={owners}
      />
    </AppShell>
  );
}
