// Core puro: dado lo que dice Notion y lo que dice la base, decide QUE hay que hacer con cada
// pagina. No escribe nada, no conoce la DB. El repository ejecuta el plan que sale de aca.
//
// Separado del ejecutor porque la parte dificil de esto no es escribir, es clasificar: la
// diferencia entre "esta pagina hay que alinearla" y "esta pagina hay que mirarla con Sebastian"
// es una regla de negocio, y como funcion pura se prueba con una tabla de casos en vez de con
// una base sembrada.
//
// La regla que ordena todo: Notion manda en estado y owner. Lo que se aplica solo es el caso en
// que las dos apuntan a la MISMA pagina y difieren; todo lo demas se reporta, porque implica
// decidir identidad y esa decision no la toma una tool.

export type PaginaNotion = {
  pageId: string;
  estado: string; // ya mapeado a slug de estado_notion
  owner?: string | null;
  nombre?: string | null;
};

export type CuentaBase = {
  idEmpresa: string;
  nombre: string;
  estado: string | null;
  owner: string | null;
  notionPageId: string | null;
};

export type Alineacion = {
  pageId: string;
  idEmpresa: string;
  nombre: string;
  estadoDe: string | null;
  estadoA: string | null; // null = el estado ya coincide, no se toca
  ownerDe: string | null;
  ownerA: string | null; // null = el owner ya coincide, no se toca
};

export type PlanReconciliacion = {
  sinCambios: number;
  alinear: Alineacion[];
  paginasSinCuenta: PaginaNotion[];
  cuentasSinPagina: { idEmpresa: string; nombre: string; estado: string | null }[];
};

// Los page id de Notion aparecen con guiones y sin guiones segun de donde se lean (la URL los
// trae pegados, la API con guiones). Comparar el string crudo hace que la misma pagina se vea
// como dos.
export function normalizarPageId(pageId: string): string {
  return pageId.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
}

export function planReconciliacion(paginas: PaginaNotion[], cuentas: CuentaBase[]): PlanReconciliacion {
  const porPageId = new Map<string, CuentaBase>();
  for (const c of cuentas) {
    if (c.notionPageId) porPageId.set(normalizarPageId(c.notionPageId), c);
  }

  const plan: PlanReconciliacion = { sinCambios: 0, alinear: [], paginasSinCuenta: [], cuentasSinPagina: [] };
  const vistas = new Set<string>();

  for (const p of paginas) {
    const clave = normalizarPageId(p.pageId);
    const cuenta = porPageId.get(clave);
    if (!cuenta) {
      plan.paginasSinCuenta.push(p);
      continue;
    }
    vistas.add(clave);

    const estadoA = cuenta.estado === p.estado ? null : p.estado;
    // Un owner vacio en Notion NO borra el de la base: significa "Notion no sabe", no "no tiene".
    // Borrar owner por omision dejaria cuentas huerfanas cada vez que alguien crea una pagina sin
    // asignarla, que es el caso normal.
    const ownerNotion = p.owner?.trim() || null;
    const ownerA = ownerNotion === null || cuenta.owner === ownerNotion ? null : ownerNotion;

    if (estadoA === null && ownerA === null) {
      plan.sinCambios += 1;
      continue;
    }
    plan.alinear.push({
      pageId: p.pageId,
      idEmpresa: cuenta.idEmpresa,
      nombre: cuenta.nombre,
      estadoDe: cuenta.estado,
      estadoA,
      ownerDe: cuenta.owner,
      ownerA,
    });
  }

  // Cuentas enlazadas cuya pagina no vino en el lote. Puede ser que la borraron en Notion, o que
  // el lote esta incompleto. Se reportan, NUNCA se borran: si se elimino, fue por algo, y la
  // cuenta vuelve a Notion al primer toque.
  for (const c of cuentas) {
    if (!c.notionPageId) continue;
    if (vistas.has(normalizarPageId(c.notionPageId))) continue;
    plan.cuentasSinPagina.push({ idEmpresa: c.idEmpresa, nombre: c.nombre, estado: c.estado });
  }

  return plan;
}
