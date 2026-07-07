import type { EstadoConector } from '../db/repository.ts';

// sev calca las 4 severidades del primitivo Dot (done=verde, overdue=rojo, today=ambar,
// faint=gris). El label es el texto grande de la columna de estado del pad de referencia.
export type SevEstado = 'done' | 'overdue' | 'today' | 'faint';
export type VistaEstado = { label: string; sev: SevEstado };

export function vistaEstado(e: EstadoConector): VistaEstado {
  if (!e.tieneCredencial) return { label: 'Sin configurar', sev: 'faint' };
  if (e.ultimoResultado?.startsWith('error')) return { label: 'Caído', sev: 'overdue' };
  if (e.ultimoResultado === 'ok') return { label: 'Vivo', sev: 'done' };
  return { label: 'Configurado', sev: 'today' };
}

export type ResumenEstados = { vivo: number; caido: number; espera: number; sinConfigurar: number };

export function contarEstados(vistas: Pick<VistaEstado, 'sev'>[]): ResumenEstados {
  const r: ResumenEstados = { vivo: 0, caido: 0, espera: 0, sinConfigurar: 0 };
  for (const v of vistas) {
    if (v.sev === 'done') r.vivo++;
    else if (v.sev === 'overdue') r.caido++;
    else if (v.sev === 'today') r.espera++;
    else r.sinConfigurar++;
  }
  return r;
}
