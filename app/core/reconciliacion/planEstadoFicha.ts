// Core puro: el plan de reconciliar_notion con destinoEstado "notion". Decide, pagina por
// pagina, que va a quedar en empresa.estado_ficha_notion (el espejo del Estado de la ficha). No
// escribe, no conoce la DB.
//
// Es un plan aparte de planReconciliacion y no un flag adentro de el porque responde otra
// pregunta. Aquel alinea la etapa INTERNA (y owner y campos) a Notion; este solo copia el Estado
// de Notion a su espejo y jamas mira ni mueve la interna. Meterlo como rama de aquel dejaria a
// un `if` de distancia el error que el modo existe para evitar: pisar la etapa interna.
//
// Mismo criterio de identidad que planReconciliacion: la llave es el page id normalizado. Pagina
// sin cuenta y cuenta enlazada cuya pagina no vino se REPORTAN, nunca se escriben.

import { normalizarPageId } from './planReconciliacion';
import type { EstadoFichaNotion } from './mapeoEstados';

export type PaginaFicha = { pageId: string; estado: EstadoFichaNotion; nombre?: string | null };

export type CuentaFicha = {
  idEmpresa: string;
  nombre: string;
  notionPageId: string | null;
  estadoInterno: string | null;
  estadoFicha: string | null;
  estadoFichaFecha: string | null;
};

// cambia: el espejo queda distinto de lo que tenia (incluye el primer llenado, de null a algo).
// confirma: el espejo ya decia eso; se escribe solo la fecha de lectura.
export type EscrituraFicha = {
  pageId: string;
  idEmpresa: string;
  nombre: string;
  estadoInterno: string | null;
  fichaDe: string | null;
  fichaA: EstadoFichaNotion;
  tipo: 'cambia' | 'confirma';
  // La diferencia que el operador decidio conservar: la interna dice una cosa y Notion otra.
  difiereDeInterno: boolean;
};

export type PlanEstadoFicha = {
  escribir: EscrituraFicha[];
  cambian: number;
  confirman: number;
  difierenDeInterno: number;
  paginasSinCuenta: PaginaFicha[];
  cuentasSinPagina: { idEmpresa: string; nombre: string; estado: string | null }[];
  // Dos paginas del lote que apuntan a la misma cuenta. Se reporta y no se escribe ninguna: no
  // hay forma de saber cual es la buena sin mirar.
  paginasDuplicadas: { idEmpresa: string; pageIds: string[] }[];
};

export function planEstadoFicha(paginas: PaginaFicha[], cuentas: CuentaFicha[]): PlanEstadoFicha {
  const porPageId = new Map<string, CuentaFicha>();
  for (const c of cuentas) if (c.notionPageId) porPageId.set(normalizarPageId(c.notionPageId), c);

  const plan: PlanEstadoFicha = {
    escribir: [],
    cambian: 0,
    confirman: 0,
    difierenDeInterno: 0,
    paginasSinCuenta: [],
    cuentasSinPagina: [],
    paginasDuplicadas: [],
  };

  const porCuenta = new Map<string, { cuenta: CuentaFicha; paginas: PaginaFicha[] }>();
  const vistas = new Set<string>();
  for (const p of paginas) {
    const clave = normalizarPageId(p.pageId);
    const cuenta = porPageId.get(clave);
    if (!cuenta) {
      plan.paginasSinCuenta.push(p);
      continue;
    }
    vistas.add(clave);
    const g = porCuenta.get(cuenta.idEmpresa) ?? { cuenta, paginas: [] };
    g.paginas.push(p);
    porCuenta.set(cuenta.idEmpresa, g);
  }

  for (const { cuenta, paginas: ps } of porCuenta.values()) {
    // La misma pagina repetida con el mismo estado no es un conflicto, es un lote con eco.
    const distintas = new Set(ps.map((p) => p.estado));
    if (distintas.size > 1) {
      plan.paginasDuplicadas.push({ idEmpresa: cuenta.idEmpresa, pageIds: ps.map((p) => p.pageId) });
      continue;
    }
    const p = ps[0];
    const tipo = cuenta.estadoFicha === p.estado ? 'confirma' : 'cambia';
    const difiereDeInterno = cuenta.estadoInterno !== p.estado;
    plan.escribir.push({
      pageId: p.pageId,
      idEmpresa: cuenta.idEmpresa,
      nombre: cuenta.nombre,
      estadoInterno: cuenta.estadoInterno,
      fichaDe: cuenta.estadoFicha,
      fichaA: p.estado,
      tipo,
      difiereDeInterno,
    });
    if (tipo === 'cambia') plan.cambian += 1;
    else plan.confirman += 1;
    if (difiereDeInterno) plan.difierenDeInterno += 1;
  }

  for (const c of cuentas) {
    if (!c.notionPageId) continue;
    if (vistas.has(normalizarPageId(c.notionPageId))) continue;
    plan.cuentasSinPagina.push({ idEmpresa: c.idEmpresa, nombre: c.nombre, estado: c.estadoInterno });
  }
  return plan;
}
