import { requireSession } from '../lib/session';
import { hoy as hoyDemo } from '../lib/reloj';
import { AppShell } from '../ui/shell/AppShell';
import { ventanaPromedio, promedioDiario } from '../core/actividad';
import { diasEntre } from '../core/tiempoEnEtapa';
import { calcularVelocidadCambioEtapa } from '../core/velocity';
import { calcularFollowUpPorDeal } from '../core/panel/followUpPorDeal';
import { calcularConversionStage } from '../core/panel/conversionStage';
import { FUNNEL_ETAPAS } from '../db/funnel';
import {
  contarToquesEnRango,
  leadsTocadosEnRango,
  toquesPorCanal,
  toquesPorResultado,
  campanasActivas,
  inscripcionesActivas,
  empresasPorCadencia,
  ownersConToques,
  duracionPromedioPorEtapa,
  cicloVentaPromedio,
  transicionesEnRango,
  mrrEstimadoTotal,
  dealsNuevosEnRango,
  reunionesAgendadasEnRango,
  segmentacionPorPersona,
  toquesAntesDeCerrarPromedio,
  empresasParaConversionStage,
} from '../db/repository';
import { WIDGETS } from '../core/panel/widgets';
import { resolverMetrica, type MetricaValor } from '../core/panel/metricas';
import { cargarTablero } from './actions';
import { PanelClient } from './PanelClient';

// searchParams: owner/desde/hasta cablean el filtro real de la Tarea 14 (owner existe
// en empresa.owner; fecha ya usa la ventana de actividad.ts). stage/segmento/monto no
// tienen fuente hoy y quedan chips visuales deshabilitados en Cockpit.tsx.
//
// Fase 4 (plan-produccion-cro-campana.md, tarea 11): "exponer el panel a todos los
// usuarios" -- el gate de admin que habia aca (redirect('/') sin usuario.admin) se quita.
// Sigue detras de requireSession (hace falta sesion valida) igual que el resto de la app;
// no hay hoy un rol "CRO" separado de admin/miembro normal en UsuarioSesion (solo
// id/email/owner/admin/idOrganizacion/soloLectura, ver app/lib/session-user.ts), asi que
// "todos los usuarios" se toma literal: cualquier miembro autenticado de la organizacion
// ve el cockpit. actions.ts (cargarTablero/guardarTablero) tenia el mismo gate --se quita
// ahi tambien-- porque panel_tablero.id_user ya es un layout PERSONAL por usuario (PK
// id_user), abrir la edicion no expone el tablero de nadie mas.
export default async function Panel({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string; desde?: string; hasta?: string }>;
}) {
  const usuario = await requireSession();

  const params = await searchParams;
  const hoy = hoyDemo();
  const ventana = ventanaPromedio(hoy);
  const desde = params.desde || ventana.desde;
  const hasta = params.hasta || ventana.hasta;
  const owner = params.owner || undefined;

  const diasVentana = Math.max(1, diasEntre(desde, hasta) + 1);

  const toquesTotal = contarToquesEnRango(desde, hasta, owner);
  // followUpPorDeal (conectado 2026-07-22): "deal" es la MISMA definicion que ya usa
  // leadsTocadosEnRango (empresa distinta con toque en el rango) -- se reusan los dos
  // conteos que este objeto YA calcula para toques_total/leads_tocados en vez de volver a
  // consultar la DB; la division es logica pura, vive en core/panel/followUpPorDeal.ts.
  const leadsTocados = leadsTocadosEnRango(desde, hasta, owner);
  const datos = {
    toquesTotal,
    promedioDiario: promedioDiario(toquesTotal),
    leadsTocados,
    toquesPorCanal: toquesPorCanal(desde, hasta, owner),
    toquesPorResultado: toquesPorResultado(desde, hasta, owner),
    campanasActivas: campanasActivas(),
    inscripcionesActivas: inscripcionesActivas(),
    empresasPorCadencia: empresasPorCadencia(),
    tiempoPromedioPorEtapa: duracionPromedioPorEtapa(usuario.idOrganizacion, hoy),
    cicloVentaPromedio: cicloVentaPromedio(usuario.idOrganizacion, hoy),
    velocidadCambioEtapa: calcularVelocidadCambioEtapa(transicionesEnRango(usuario.idOrganizacion, desde, hasta), diasVentana),
    mrrEstimadoTotal: mrrEstimadoTotal(usuario.idOrganizacion),
    dealsNuevosEnRango: dealsNuevosEnRango(usuario.idOrganizacion, desde, hasta, owner),
    reunionesAgendadasEnRango: reunionesAgendadasEnRango(usuario.idOrganizacion, desde, hasta, owner),
    followUpPorDeal: calcularFollowUpPorDeal(toquesTotal, leadsTocados),
    // Sin owner: contacto no tiene columna de fecha, y el grupo 'segmentacion' es un
    // snapshot del comite de compra, no un evento en rango -- ver el comentario largo en
    // segmentacionPorPersona (repository.ts).
    segmentacionPorPersona: segmentacionPorPersona(usuario.idOrganizacion, owner),
    // Sin owner ni rango: mismo criterio que cicloVentaPromedio/duracionPromedioPorEtapa
    // (vecinos en el grupo 'velocity') -- vista del CRO sobre TODO el historial.
    toquesAntesDeCerrarPromedio: toquesAntesDeCerrarPromedio(usuario.idOrganizacion),
    // conversion_stage (2026-07-22): mismo criterio sin-owner que sus vecinos de 'velocity'
    // de arriba -- vista del CRO sobre TODA la organizacion, no un corte por vendedor
    // (empresasParaConversionStage soporta owner pero este caller no lo usa, ver el
    // comentario largo junto a la funcion en repository.ts). El orden del funnel sale de
    // FUNNEL_ETAPAS (db/funnel.ts), la unica fuente de verdad del orden en el repo.
    conversionStage: calcularConversionStage(
      empresasParaConversionStage(usuario.idOrganizacion),
      FUNNEL_ETAPAS.map((e) => e.estado),
    ),
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
