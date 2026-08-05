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
  toquesParaActividadCanal,
} from '../db/repository';
import { conversionPorOrigen, type ToqueConOrigen } from '../core/conversion-origen';
import { coberturaOrigenLead } from '../db/repository';
import {
  type ToqueCanal,
  connectRate,
  toquesPorGrupo,
  textoDeduplicado,
  llamadasPorNovedadDeCuenta,
} from '../core/actividad-canal';
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

  // Las cinco metricas de actividad salen de UNA sola lectura: son cortes distintos sobre las
  // mismas filas, y pedirlas por separado seria cinco queries para responder una pregunta.
  //
  // El cast de `resultado`: la columna es TEXT y produccion tiene cinco filas con prosa de la epoca
  // en que era texto libre, o sea valores fuera del vocabulario. El nucleo pregunta si el valor
  // esta en RESULTADOS_CONTESTO, asi que una prosa vieja cae del lado de "no conecto". Es la
  // direccion conservadora (hunde la tasa en vez de inflarla) y son cinco filas sobre cientos.
  const filasCanal = toquesParaActividadCanal(desde, hasta, usuario.idOrganizacion, owner ? { owner } : {}).map((f) => ({
    ...f,
    resultado: f.resultado as ToqueCanal['resultado'],
  }));
  const conexion = connectRate(filasCanal);
  const porGrupo = toquesPorGrupo(filasCanal);
  const dedupDia = textoDeduplicado(filasCanal, { modo: 'dia' });
  const dedupConversacion = textoDeduplicado(filasCanal, { modo: 'conversacion' });
  const novedad = llamadasPorNovedadDeCuenta(filasCanal);
  const porOrigen = conversionPorOrigen(filasCanal as unknown as ToqueConOrigen[]);
  const cobertura = coberturaOrigenLead(usuario.idOrganizacion);

  const actividadDeCanal = {
    // La tasa se guarda en porcentaje redondeado a un decimal: el widget de KPI pinta un numero, no
    // formatea fracciones. null viaja tal cual y resolverMetrica lo traduce a "sin datos", que es
    // la verdad cuando ninguna llamada quedo calificada.
    connectRate: conexion.tasa === null ? null : Math.round(conexion.tasa * 1000) / 10,
    // Las llamadas sin resultado van en su propia barra y NO del lado de las que no conectaron. Es
    // una llamada que nadie califico, y meterla del lado negativo hunde la tasa con un dato que no
    // existe.
    connectRateDetalle: {
      Conectadas: conexion.conectadas,
      'No conectaron': conexion.noConectadas,
      'Sin calificar': conexion.sinResultado,
    },
    toquesPorGrupoCanal: {
      Texto: porGrupo.texto,
      Llamada: porGrupo.llamada,
      Reunión: porGrupo.reunion,
    },
    // Los tres lado a lado. La distancia entre ellos ES el dato: dice cuanto del volumen de texto
    // es conversacion viva y cuanto es la misma conversacion contada muchas veces.
    textoDeduplicado: {
      Crudo: dedupDia.crudos,
      'Por día': dedupDia.deduplicados,
      'Por conversación': dedupConversacion.deduplicados,
    },
    llamadasCuentasNuevas: {
      'Cuentas nuevas': novedad.aCuentasNuevas,
      'Con historia': novedad.aCuentasConHistoria,
    },
    // Un origen sin reuniones da null y NO cero: cero llamadas por reunion diria que la reunion
    // salio gratis. Se omite del widget en vez de pintar un numero que miente.
    conversionPorOrigen: Object.fromEntries(
      porOrigen.porOrigen.filter((g) => g.llamadasPorReunion !== null).map((g) => [g.origen, Math.round(g.llamadasPorReunion! * 10) / 10]),
    ),
    // El denominador de la comparacion de arriba. Hoy va a decir 0 con origen y ~1.956 sin, porque
    // la columna nace vacia; esa es la verdad y verla es lo que empuja a llenarla.
    coberturaOrigenLead: {
      'Con origen': cobertura.conOrigen,
      'Sin registrar': cobertura.sinOrigen,
    },
  };
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
    ...actividadDeCanal,
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
        hoy={hoy}
        owner={owner}
        owners={owners}
      />
    </AppShell>
  );
}
