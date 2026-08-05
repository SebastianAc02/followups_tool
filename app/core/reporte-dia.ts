// El reporte del dia, en dos niveles (dictado del operador, 2026-08-05). Puro: sin DB y sin I/O,
// mismo criterio que dashboard-cro.ts y actividad-canal.ts -- recibe arreglos ya leidos y
// devuelve numeros y clasificaciones auditables.
//
// POR QUE DOS TIPOS Y NO UNO CON CAMPOS OPCIONALES. Lo que ve un tercero es un OBJETO DISTINTO,
// construido en el servidor. Un reporte completo que viaja al cliente y se esconde en el render esta
// a un "ver codigo fuente" de no estar escondido, y esto es observacion sobre el trabajo de una
// persona: el repo ya tiene una regla dura sobre que eso no sale (CLAUDE.md del brain, regla 23).
//
// POR QUE DOS ARREGLOS DE ENTRADA Y NO UNO SOLO. La forma sugerida del encargo era un unico
// `toques: ToqueX[]`, pero ninguna funcion existente del repository trae TODAS las columnas que
// este reporte necesita en una sola fila: toquesParaActividadCanal trae esPrimerToqueDeLaCuenta y
// origenLead pero NO tipoToque/reunionFechaOcurrida, y toquesEnRango (la que arma ToqueDashboardCRO,
// consumida hoy por dashboardCroTool en mcp/tools.ts) trae tipoToque/reunionFechaOcurrida pero NO
// esPrimerToqueDeLaCuenta/origenLead. Las dos leen el mismo `toque` con el mismo filtro de dia y
// owner, asi que representan el MISMO conjunto de filas, solo que proyectado distinto -- lo que no
// se puede es fusionarlas fila a fila, porque ninguna trae idToque en su tipo de salida y ademas
// vienen en ORDEN DISTINTO (una ordena por fecha asc+id asc, la otra por fecha desc+id desc); cruzar
// por posicion de arreglo asignaria mal el tipoToque de un toque a otro. Por eso `ToquesReporteDia`
// es un objeto con las dos proyecciones, y cada bloque del reporte usa la que le sirve.
import { toquesPorGrupo, connectRate, textoDeduplicado, llamadasPorNovedadDeCuenta, type ToqueCanal } from './actividad-canal.ts';
import {
  mixPorCanal as mixPorCanalCRO,
  mixPorTipoToque,
  embudoReuniones,
  llamadasPorReunionConseguida,
  respuestasEntrantesWhatsapp,
  type ToqueDashboardCRO,
} from './dashboard-cro.ts';
import { conversionPorOrigen, type ToqueConOrigen } from './conversion-origen.ts';

// La proyeccion de toquesParaActividadCanal (ToqueCanal) mas los dos campos que esa misma
// funcion ya trae y ToqueCanal no modela (origenLead, reunionFechaPropuesta) -- ver
// ToqueActividadCanal en app/db/repository.ts, es exactamente esta forma.
export type ToqueReporteCanal = ToqueCanal & {
  origenLead: string | null;
  reunionFechaPropuesta: string | null;
};

export type ToquesReporteDia = {
  // De toquesParaActividadCanal(dia, dia, idOrganizacion, {owner}).
  canal: ToqueReporteCanal[];
  // De toquesEnRango(dia, dia, idOrganizacion, {owner}), mapeado a ToqueDashboardCRO (mismo
  // adaptador que ya hace dashboardCroTool en app/mcp/tools.ts).
  dashboard: ToqueDashboardCRO[];
};

// Lo que el dia planeaba contra lo que salio. Entra ya calculado (planVsEjecutadoTool del MCP)
// porque vive en otra tabla (toque_planeado) y este archivo no lee nada.
export type PlanDelDia = { planeados: number; ejecutados: number };

export type Tasa = number | null;

export type ReporteCompleto = {
  nivel: 'completo';
  dia: string;
  owner: string;
  actividad: {
    // Toques que HIZO el operador. Los entrantes van aparte y jamas suman aca.
    toquesEjecutados: number;
    porGrupoCanal: { texto: number; llamada: number; reunion: number };
    entrantesWhatsapp: { mensajes: number; cuentas: number };
  };
  // Mix por el valor LITERAL de canal (llamada/whatsapp/correo/reunion/sin_canal), distinto del
  // agrupado texto/llamada/reunion de arriba: ese agrupa whatsapp+correo en "texto" porque asi
  // piensa el operador el canal de contacto; este es el detalle sin agrupar, mismo criterio que
  // dashboardCroTool.
  mixPorCanal: { porCanal: Record<string, number>; total: number };
  conversion: { llamadas: number; reunionesConseguidas: number; llamadasPorReunion: Tasa };
  llamadas: { total: number; conectadas: number; noConectadas: number; sinCalificar: number; connectRate: Tasa };
  reuniones: { propuestas: number; ocurridas: number; noShow: number; sinDesenlace: number; noShowRate: Tasa };
  plan: { planeados: number; ejecutados: number; noSalieron: number };
  mixPorTipo: { porTipo: Record<string, number>; conTipo: number; sinTipo: number };
  texto: { crudos: number; porDia: number; porConversacion: number };
  cuentas: { aCuentasNuevas: number; aCuentasConHistoria: number };
  origen: { porOrigen: { origen: string; llamadas: number; reunionesConseguidas: number; llamadasPorReunion: Tasa }[]; sinRegistrar: number };
};

export type ReporteEquipo = {
  nivel: 'equipo';
  dia: string;
  owner: string;
  actividad: { toquesEjecutados: number };
  conversion: { llamadas: number; reunionesConseguidas: number; llamadasPorReunion: Tasa };
  tasas: { connectRate: Tasa; noShowRate: Tasa };
};

// Division que devuelve null y no cero cuando no hay denominador. Cero por ciento de no-show con
// cero reuniones diria que el dia salio perfecto, cuando lo que pasa es que no hubo reuniones.
function tasa(numerador: number, denominador: number): Tasa {
  return denominador === 0 ? null : numerador / denominador;
}

export function reporteDelDia(toques: ToquesReporteDia, plan: PlanDelDia, ctx: { dia: string; owner: string }): ReporteCompleto {
  const ejecutadosCanal = toques.canal.filter((t) => t.fuente !== 'whatsapp_entrante');
  const grupo = toquesPorGrupo(toques.canal);
  const conexion = connectRate(toques.canal);
  const novedad = llamadasPorNovedadDeCuenta(toques.canal);
  const porOrigen = conversionPorOrigen(toques.canal as ToqueConOrigen[]);

  // Los tres bloques que necesitan tipoToque/reunionFechaOcurrida SIEMPRE leen `toques.dashboard`,
  // nunca `toques.canal` (que no trae esas columnas -- ver el comentario largo arriba del archivo).
  const mix = mixPorCanalCRO(toques.dashboard);
  const tipo = mixPorTipoToque(toques.dashboard);
  const embudo = embudoReuniones(toques.dashboard);
  const costoReunion = llamadasPorReunionConseguida(toques.dashboard);
  const entrantes = respuestasEntrantesWhatsapp(toques.dashboard);

  return {
    nivel: 'completo',
    dia: ctx.dia,
    owner: ctx.owner,
    actividad: {
      toquesEjecutados: ejecutadosCanal.length,
      porGrupoCanal: { texto: grupo.texto, llamada: grupo.llamada, reunion: grupo.reunion },
      entrantesWhatsapp: { mensajes: entrantes.totalMensajes, cuentas: entrantes.cuentasUnicas },
    },
    mixPorCanal: { porCanal: mix.porCanal, total: mix.total },
    conversion: {
      llamadas: costoReunion.llamadas,
      reunionesConseguidas: costoReunion.reunionesPropuestas,
      llamadasPorReunion: costoReunion.llamadasPorReunion,
    },
    llamadas: {
      total: conexion.llamadas,
      conectadas: conexion.conectadas,
      noConectadas: conexion.noConectadas,
      sinCalificar: conexion.sinResultado,
      connectRate: conexion.tasa,
    },
    reuniones: {
      propuestas: embudo.propuestas,
      ocurridas: embudo.ocurridas,
      noShow: embudo.noShow,
      sinDesenlace: embudo.sinDesenlace,
      noShowRate: tasa(embudo.noShow, embudo.propuestas),
    },
    plan: { planeados: plan.planeados, ejecutados: plan.ejecutados, noSalieron: Math.max(0, plan.planeados - plan.ejecutados) },
    mixPorTipo: { porTipo: tipo.porTipo, conTipo: tipo.toquesConTipo, sinTipo: tipo.toquesSinTipo },
    texto: {
      crudos: textoDeduplicado(toques.canal, { modo: 'dia' }).crudos,
      porDia: textoDeduplicado(toques.canal, { modo: 'dia' }).deduplicados,
      porConversacion: textoDeduplicado(toques.canal, { modo: 'conversacion' }).deduplicados,
    },
    cuentas: { aCuentasNuevas: novedad.aCuentasNuevas, aCuentasConHistoria: novedad.aCuentasConHistoria },
    origen: {
      porOrigen: porOrigen.porOrigen.map((g) => ({
        origen: g.origen,
        llamadas: g.llamadas,
        reunionesConseguidas: g.reunionesConseguidas,
        llamadasPorReunion: g.llamadasPorReunion,
      })),
      sinRegistrar: porOrigen.cobertura.cuentasSinOrigen,
    },
  };
}

// DERIVA del completo, no recalcula. Si recalculara, los dos numeros podrian discrepar y nadie
// sabria cual creer; y ademas el filtro dejaria de ser una sola decision auditable.
export function vistaDeEquipo(completo: ReporteCompleto): ReporteEquipo {
  return {
    nivel: 'equipo',
    dia: completo.dia,
    owner: completo.owner,
    actividad: { toquesEjecutados: completo.actividad.toquesEjecutados },
    conversion: { ...completo.conversion },
    tasas: { connectRate: completo.llamadas.connectRate, noShowRate: completo.reuniones.noShowRate },
  };
}

// QUIEN VE QUE. Solo el dueño de la data ve el nivel completo.
//
// `admin` NO abre el nivel completo, y `verTodoPipeline` (el rol de CRO) tampoco. Dos razones: el
// propio session-user.ts ya fija que el operador es admin y aun asi debe ver solo su cartera; y el
// rol de CRO existe para ver el PIPELINE de todos, que es otra cosa que la actividad de una persona.
// El operador dijo explicito que le da al equipo un subconjunto.
export function nivelPara(
  usuario: { owner: string; admin: boolean; verTodoPipeline: boolean },
  ownerDelReporte: string,
): 'completo' | 'equipo' {
  return usuario.owner === ownerDelReporte ? 'completo' : 'equipo';
}
