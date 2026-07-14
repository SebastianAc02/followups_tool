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
} from '../db/repository';
import { WIDGETS } from '../core/panel/widgets';
import { resolverMetrica, type MetricaValor } from '../core/panel/metricas';
import { cargarTablero } from './actions';
import { PanelClient } from './PanelClient';

export default async function Panel() {
  const usuario = await requireSession();
  if (!usuario.admin) redirect('/'); // sin flag admin, la ruta no existe para el usuario

  const hoy = new Date().toISOString().slice(0, 10);
  const { desde, hasta } = ventanaPromedio(hoy);

  const toquesTotal = contarToquesEnRango(desde, hasta);
  const datos = {
    toquesTotal,
    promedioDiario: promedioDiario(toquesTotal),
    leadsTocados: leadsTocadosEnRango(desde, hasta),
    toquesPorCanal: toquesPorCanal(desde, hasta),
    toquesPorResultado: toquesPorResultado(desde, hasta),
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

  return (
    <AppShell>
      <PanelClient tablero={tablero} metricas={metricas} email={usuario.email} desde={desde} hasta={hasta} />
    </AppShell>
  );
}
