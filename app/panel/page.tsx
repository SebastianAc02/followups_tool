import { requireSession } from '../lib/session';
import { hoy as hoyDemo } from '../lib/reloj';
import { AppShell } from '../ui/shell/AppShell';
import { ventanaPromedio, promedioDiario } from '../core/actividad';
import { diasEntre } from '../core/tiempoEnEtapa';
import { calcularVelocidadCambioEtapa } from '../core/velocity';
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
  leerConfiguracionAdmin,
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

  // MRR estimado (metrica 4): tarifa_txn_plan / saas_mensual no existen como columna ni
  // tabla en ningun lado (se busco en schema.ts y app/adapters/notion/ antes de escribir
  // esto, ver el comentario largo en app/core/mrr.ts) -- se leen de configuracion_admin,
  // el mismo mecanismo clave/valor que ya usa el buzon de Apollo en /conectores. Sin
  // configurar todavia, caen a 0 (no se inventa una tarifa).
  const tarifaTxnPlan = Number(leerConfiguracionAdmin('mrr_tarifa_txn_plan')) || 0;
  const saasMensual = Number(leerConfiguracionAdmin('mrr_saas_mensual')) || 0;
  const diasVentana = Math.max(1, diasEntre(desde, hasta) + 1);

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
    tiempoPromedioPorEtapa: duracionPromedioPorEtapa(usuario.idOrganizacion, hoy),
    cicloVentaPromedio: cicloVentaPromedio(usuario.idOrganizacion, hoy),
    velocidadCambioEtapa: calcularVelocidadCambioEtapa(transicionesEnRango(usuario.idOrganizacion, desde, hasta), diasVentana),
    mrrEstimadoTotal: mrrEstimadoTotal(usuario.idOrganizacion, tarifaTxnPlan, saasMensual),
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
