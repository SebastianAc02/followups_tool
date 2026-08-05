// El reporte del dia, en dos niveles (dictado del operador, 2026-08-05). Puro: sin DB y sin I/O,
// mismo criterio que dashboard-cro.ts y actividad-canal.ts.
//
// POR QUE DOS TIPOS Y NO UNO CON CAMPOS OPCIONALES. Lo que ve un tercero es un OBJETO DISTINTO,
// construido en el servidor. Un reporte completo que viaja al cliente y se esconde en el render esta
// a un "ver codigo fuente" de no estar escondido, y esto es observacion sobre el trabajo de una
// persona: el repo ya tiene una regla dura sobre que eso no sale (CLAUDE.md del brain, regla 23).
//
// Dictado textual sobre el nivel de equipo: "lo que pueda ver la parte del equipo es solamente lo
// que a mi me interesa que vean: mi actividad real, mis conversiones a reunion, mis tasas, mis
// toques efectivos ejecutados y ya, solo eso".
import { RESULTADOS_CONTESTO, RESULTADOS_REUNION_OCURRIDA, type Resultado } from '../db/validation.ts';
import { toquesPorGrupo, connectRate, textoDeduplicado, llamadasPorNovedadDeCuenta, type ToqueCanal } from './actividad-canal.ts';
import { mixPorTipoToque, respuestasEntrantesWhatsapp, type ToqueDashboardCRO } from './dashboard-cro.ts';
import { conversionPorOrigen, type ToqueConOrigen } from './conversion-origen.ts';

export type ToqueReporte = ToqueCanal & {
  origenLead: string | null;
  reunionFechaPropuesta: string | null;
};

// Lo que el dia planeaba contra lo que salio. Entra ya calculado (planVsEjecutado del MCP) porque
// vive en otra tabla y este archivo no lee nada.
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

const esEntrante = (t: ToqueReporte) => t.fuente === 'whatsapp_entrante';

export function reporteDelDia(toques: ToqueReporte[], plan: PlanDelDia, ctx: { dia: string; owner: string }): ReporteCompleto {
  const ejecutados = toques.filter((t) => !esEntrante(t));
  const grupo = toquesPorGrupo(toques);
  const conexion = connectRate(toques);
  const entrantes = respuestasEntrantesWhatsapp(toques as unknown as ToqueDashboardCRO[]);
  const tipo = mixPorTipoToque(toques as unknown as ToqueDashboardCRO[]);
  const novedad = llamadasPorNovedadDeCuenta(toques);
  const porOrigen = conversionPorOrigen(toques as unknown as ToqueConOrigen[]);

  // Reunion CONSEGUIDA: el toque dejo una fecha propuesta. Es el mismo criterio de
  // llamadasPorReunionConseguida en dashboard-cro.ts, y se mantiene igual a proposito para que los
  // dos numeros se puedan comparar entre pantallas.
  const propuestas = ejecutados.filter((t) => t.reunionFechaPropuesta);
  const ocurridas = ejecutados.filter(
    (t) => t.resultado && RESULTADOS_REUNION_OCURRIDA.includes(t.resultado as Resultado),
  );
  const noShow = ejecutados.filter((t) => t.resultado === 'no_llego');

  return {
    nivel: 'completo',
    dia: ctx.dia,
    owner: ctx.owner,
    actividad: {
      toquesEjecutados: ejecutados.length,
      porGrupoCanal: { texto: grupo.texto, llamada: grupo.llamada, reunion: grupo.reunion },
      entrantesWhatsapp: { mensajes: entrantes.totalMensajes, cuentas: entrantes.cuentasUnicas },
    },
    conversion: {
      llamadas: conexion.llamadas,
      reunionesConseguidas: propuestas.length,
      llamadasPorReunion: tasa(conexion.llamadas, propuestas.length),
    },
    llamadas: {
      total: conexion.llamadas,
      conectadas: conexion.conectadas,
      noConectadas: conexion.noConectadas,
      sinCalificar: conexion.sinResultado,
      connectRate: conexion.tasa,
    },
    reuniones: {
      propuestas: propuestas.length,
      ocurridas: ocurridas.length,
      noShow: noShow.length,
      // Lo que todavia no tiene desenlace. Nunca negativo: una reunion puede figurar como ocurrida
      // en un dia distinto al que se propuso, asi que la resta puede pasarse.
      sinDesenlace: Math.max(0, propuestas.length - ocurridas.length - noShow.length),
      noShowRate: tasa(noShow.length, propuestas.length),
    },
    plan: { planeados: plan.planeados, ejecutados: plan.ejecutados, noSalieron: Math.max(0, plan.planeados - plan.ejecutados) },
    mixPorTipo: { porTipo: tipo.porTipo, conTipo: tipo.toquesConTipo, sinTipo: tipo.toquesSinTipo },
    texto: {
      crudos: textoDeduplicado(toques, { modo: 'dia' }).crudos,
      porDia: textoDeduplicado(toques, { modo: 'dia' }).deduplicados,
      porConversacion: textoDeduplicado(toques, { modo: 'conversacion' }).deduplicados,
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
