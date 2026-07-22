// Resuelve un DataSourceKey (ver widgets.ts) contra datos ya calculados por el caller.
// Puro: no importa app/db/repository.ts ni el driver de DB (CLAUDE.md: el core no toca
// adaptadores directo). El caller (server component de la pagina) llama a las funciones
// del Repository, arma este objeto plano, y aca solo se hace el switch exhaustivo.

import type { DataSourceKey } from './widgets.ts';

export type MetricaValor =
  | { estado: 'ok'; valor: number }
  | { estado: 'ok'; valor: Record<string, number> } // toquesPorCanal/toquesPorResultado
  | { estado: 'ok'; valor: { cadencia: string; empresas: number }[] } // empresasPorCadencia
  | { estado: 'sin_datos' };

// Cada campo es opcional: el caller solo llena lo que ya calculo para esta vista.
export type MetricasDatos = {
  toquesTotal?: number;
  promedioDiario?: number;
  leadsTocados?: number;
  toquesPorCanal?: Record<string, number>;
  toquesPorResultado?: Record<string, number>;
  campanasActivas?: number;
  inscripcionesActivas?: number;
  empresasPorCadencia?: { cadencia: string; empresas: number }[];
  // Fase 4 (cockpit del CRO): tiempoPromedioPorEtapa/mrrEstimadoTotal pueden venir
  // presentes pero "vacios" (objeto {} / 0 empresas) -- eso SI es 'ok' con datos reales
  // (la organizacion existe, solo no tiene historial/usuarios todavia). cicloVentaPromedio
  // es el unico null real (ninguna empresa cerro un ciclo) -- resolverMetrica lo trata
  // aparte para no confundir "no lo calcule" con "lo calcule y dio cero cierres".
  tiempoPromedioPorEtapa?: Record<string, number>;
  cicloVentaPromedio?: number | null;
  velocidadCambioEtapa?: number;
  mrrEstimadoTotal?: number;
  // Conectados 2026-07-22 (ver widgets.ts): dealsNuevosEnRango/reunionesAgendadasEnRango/
  // followUpPorDeal pueden venir en 0 (0 deals nuevos, 0 toques todavia) -- eso SI es 'ok'
  // con dato real, mismo principio que tiempoPromedioPorEtapa/mrrEstimadoTotal arriba.
  // toquesAntesDeCerrarPromedio es el unico que puede venir null (ninguna empresa llego a
  // firma_pago todavia): mismo tratamiento que cicloVentaPromedio, null real != sin_datos.
  dealsNuevosEnRango?: number;
  reunionesAgendadasEnRango?: number;
  followUpPorDeal?: number;
  segmentacionPorPersona?: Record<string, number>;
  toquesAntesDeCerrarPromedio?: number | null;
};

const SIN_DATOS: MetricaValor = { estado: 'sin_datos' };

export function resolverMetrica(dataSource: DataSourceKey | null, datos: MetricasDatos): MetricaValor {
  if (dataSource === null) return SIN_DATOS;

  switch (dataSource) {
    case 'toquesTotal':
      return datos.toquesTotal === undefined ? SIN_DATOS : { estado: 'ok', valor: datos.toquesTotal };
    case 'promedioDiario':
      return datos.promedioDiario === undefined ? SIN_DATOS : { estado: 'ok', valor: datos.promedioDiario };
    case 'leadsTocados':
      return datos.leadsTocados === undefined ? SIN_DATOS : { estado: 'ok', valor: datos.leadsTocados };
    case 'toquesPorCanal':
      return datos.toquesPorCanal === undefined ? SIN_DATOS : { estado: 'ok', valor: datos.toquesPorCanal };
    case 'toquesPorResultado':
      return datos.toquesPorResultado === undefined ? SIN_DATOS : { estado: 'ok', valor: datos.toquesPorResultado };
    case 'campanasActivas':
      return datos.campanasActivas === undefined ? SIN_DATOS : { estado: 'ok', valor: datos.campanasActivas };
    case 'inscripcionesActivas':
      return datos.inscripcionesActivas === undefined ? SIN_DATOS : { estado: 'ok', valor: datos.inscripcionesActivas };
    case 'empresasPorCadencia':
      return datos.empresasPorCadencia === undefined ? SIN_DATOS : { estado: 'ok', valor: datos.empresasPorCadencia };
    case 'tiempoPromedioPorEtapa':
      return datos.tiempoPromedioPorEtapa === undefined ? SIN_DATOS : { estado: 'ok', valor: datos.tiempoPromedioPorEtapa };
    case 'cicloVentaPromedio':
      // null = se calculo pero ninguna empresa cerro un ciclo todavia (ver comentario en
      // MetricasDatos): mismo tratamiento visual que sin_datos, no hay numero que mostrar.
      return datos.cicloVentaPromedio === undefined || datos.cicloVentaPromedio === null
        ? SIN_DATOS
        : { estado: 'ok', valor: datos.cicloVentaPromedio };
    case 'velocidadCambioEtapa':
      return datos.velocidadCambioEtapa === undefined ? SIN_DATOS : { estado: 'ok', valor: datos.velocidadCambioEtapa };
    case 'mrrEstimadoTotal':
      return datos.mrrEstimadoTotal === undefined ? SIN_DATOS : { estado: 'ok', valor: datos.mrrEstimadoTotal };
    case 'dealsNuevosEnRango':
      return datos.dealsNuevosEnRango === undefined ? SIN_DATOS : { estado: 'ok', valor: datos.dealsNuevosEnRango };
    case 'reunionesAgendadasEnRango':
      return datos.reunionesAgendadasEnRango === undefined ? SIN_DATOS : { estado: 'ok', valor: datos.reunionesAgendadasEnRango };
    case 'followUpPorDeal':
      return datos.followUpPorDeal === undefined ? SIN_DATOS : { estado: 'ok', valor: datos.followUpPorDeal };
    case 'segmentacionPorPersona':
      return datos.segmentacionPorPersona === undefined ? SIN_DATOS : { estado: 'ok', valor: datos.segmentacionPorPersona };
    case 'toquesAntesDeCerrarPromedio':
      // null = se calculo pero ninguna empresa llego a firma_pago todavia (mismo
      // tratamiento que cicloVentaPromedio arriba).
      return datos.toquesAntesDeCerrarPromedio === undefined || datos.toquesAntesDeCerrarPromedio === null
        ? SIN_DATOS
        : { estado: 'ok', valor: datos.toquesAntesDeCerrarPromedio };
    default: {
      const _exhaustivo: never = dataSource;
      return _exhaustivo;
    }
  }
}
