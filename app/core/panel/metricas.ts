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
    default: {
      const _exhaustivo: never = dataSource;
      return _exhaustivo;
    }
  }
}
