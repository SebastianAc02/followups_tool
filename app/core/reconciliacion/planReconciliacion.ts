// Core puro: dado lo que dice Notion y lo que dice la base, decide QUE hay que hacer con cada
// pagina. No escribe nada, no conoce la DB. El repository ejecuta el plan que sale de aca.
//
// Separado del ejecutor porque la parte dificil de esto no es escribir, es clasificar: la
// diferencia entre "esta pagina hay que alinearla" y "esta pagina hay que mirarla con Sebastian"
// es una regla de negocio, y como funcion pura se prueba con una tabla de casos en vez de con
// una base sembrada.
//
// La regla que ordena todo: Notion manda en estado, owner y (desde 2026-09-21) en usuarios,
// fecha de ultimo contacto, proximo paso con su fecha y razon de perdida. Vacio en Notion nunca
// borra la base; un valor distinto la pisa, y la pisada sale listada con su valor anterior.
// Lo mas viejo de la regla: Notion manda en estado y owner. Lo que se aplica solo es el caso en
// que las dos apuntan a la MISMA pagina y difieren; todo lo demas se reporta, porque implica
// decidir identidad y esa decision no la toma una tool.

export type PaginaNotion = {
  pageId: string;
  estado: string; // ya mapeado a slug de estado_notion
  owner?: string | null;
  nombre?: string | null;
  // Campos opcionales (2026-09-21). Ausente, null, string vacio o usuarios <= 0 significan
  // "Notion no lo tiene" y NUNCA borran lo que tiene la base.
  usuarios?: number | null; // "Usuarios Estimados" de Notion
  fechaUltimoContacto?: string | null; // YYYY-MM-DD
  proximoPaso?: string | null;
  fechaProximoPaso?: string | null; // YYYY-MM-DD
  razonPerdida?: string | null; // ya mapeada a slug de RAZONES_PERDIDA
};

export type CuentaBase = {
  idEmpresa: string;
  nombre: string;
  estado: string | null;
  owner: string | null;
  notionPageId: string | null;
  // Opcionales para no romper a quien arma CuentaBase solo con los cinco de arriba: si no
  // vienen, el campo se trata como vacio en la base (y por ende se llena, nunca se pisa).
  usuariosReales?: number | null;
  usuariosEstimados?: number | null;
  usuariosEfectivos?: number | null;
  fechaUltimoContacto?: string | null;
  proximoPaso?: string | null;
  proximoFollowUpFecha?: string | null;
  razonPerdida?: string | null;
};

// Los campos que se reconcilian ademas de estado y owner, con el nombre de su columna en
// produccion. usuarios es el unico que no es una columna de empresa: vive en empresa_usuarios.
export const CAMPOS_RECONCILIABLES = [
  'usuarios',
  'fecha_ultimo_contacto',
  'proximo_paso',
  'proximo_follow_up_fecha',
  'razon_perdida',
] as const;
export type CampoReconciliable = (typeof CAMPOS_RECONCILIABLES)[number];

// llenado = la base lo tenia vacio. pisada = la base tenia OTRO valor y Notion gana: se lista
// con el valor anterior porque es lo unico que hay que mirar antes de aplicar.
export type CambioCampo = {
  campo: CampoReconciliable;
  de: string | number | null;
  a: string | number;
  tipo: 'llenado' | 'pisada';
  // Solo usuarios: true cuando la base tiene usuarios_reales distinto de Notion. Como
  // usuarios_efectivos = COALESCE(reales, estimados), escribir solo el estimado dejaria el
  // efectivo en el valor viejo, y Notion manda en usuarios siempre (regla 28 del brain).
  pisaUsuariosReales?: boolean;
};

export type Alineacion = {
  pageId: string;
  idEmpresa: string;
  nombre: string;
  estadoDe: string | null;
  estadoA: string | null; // null = el estado ya coincide, no se toca
  ownerDe: string | null;
  ownerA: string | null; // null = el owner ya coincide, no se toca
  campos: CambioCampo[]; // vacio = ningun campo opcional cambia
};

export type ResumenCampo = {
  llenados: number;
  pisadas: number;
  // Cada pisada con su valor anterior y el nuevo. Los llenados no se repiten aca: estan en
  // `alinear`, y no hay nada que decidir sobre un campo que estaba vacio.
  detallePisadas: { idEmpresa: string; nombre: string; de: string | number | null; a: string | number }[];
};

export type PlanReconciliacion = {
  sinCambios: number;
  alinear: Alineacion[];
  paginasSinCuenta: PaginaNotion[];
  cuentasSinPagina: { idEmpresa: string; nombre: string; estado: string | null }[];
  // El plan agrupado por campo, con conteos. estado y owner entran aca con la misma regla:
  // llenado si la base estaba vacia, pisada si tenia otro valor.
  porCampo: Record<'estado' | 'owner' | CampoReconciliable, ResumenCampo>;
  // Paginas que traen usuarios en 0 o negativo. No se escriben: un ISP con cero usuarios no es
  // un dato, es un campo que alguien lleno para salir del paso.
  usuariosNoPositivosIgnorados: { pageId: string; idEmpresa: string; usuarios: number }[];
};

function texto(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

// Las fechas de la base tienen formatos mezclados (algunas con hora). Se comparan por el dia.
function dia(v: string | null | undefined): string | null {
  const t = texto(v);
  return t ? t.slice(0, 10) : null;
}

function cambioTexto(
  campo: CampoReconciliable,
  base: string | null | undefined,
  notion: string | null | undefined,
  comparar: (x: string | null | undefined) => string | null,
): CambioCampo | null {
  const a = comparar(notion);
  if (a === null) return null; // vacio en Notion no borra
  const de = texto(base);
  if (comparar(de) === a) return null;
  return { campo, de, a, tipo: de === null ? 'llenado' : 'pisada' };
}

function resumenVacio(): ResumenCampo {
  return { llenados: 0, pisadas: 0, detallePisadas: [] };
}

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

  const plan: PlanReconciliacion = {
    sinCambios: 0,
    alinear: [],
    paginasSinCuenta: [],
    cuentasSinPagina: [],
    porCampo: {
      estado: resumenVacio(),
      owner: resumenVacio(),
      usuarios: resumenVacio(),
      fecha_ultimo_contacto: resumenVacio(),
      proximo_paso: resumenVacio(),
      proximo_follow_up_fecha: resumenVacio(),
      razon_perdida: resumenVacio(),
    },
    usuariosNoPositivosIgnorados: [],
  };
  const contar = (campo: keyof PlanReconciliacion['porCampo'], c: CuentaBase, de: string | number | null, a: string | number) => {
    const r = plan.porCampo[campo];
    if (de === null) r.llenados += 1;
    else {
      r.pisadas += 1;
      r.detallePisadas.push({ idEmpresa: c.idEmpresa, nombre: c.nombre, de, a });
    }
  };
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

    const campos: CambioCampo[] = [];

    // Usuarios: Notion gana SIEMPRE (regla 28 del brain). Se compara contra el efectivo, que es
    // el numero que ve todo el sistema.
    if (typeof p.usuarios === 'number' && Number.isFinite(p.usuarios)) {
      if (p.usuarios <= 0) {
        plan.usuariosNoPositivosIgnorados.push({ pageId: p.pageId, idEmpresa: cuenta.idEmpresa, usuarios: p.usuarios });
      } else {
        const efectivo = cuenta.usuariosEfectivos ?? cuenta.usuariosReales ?? cuenta.usuariosEstimados ?? null;
        if (efectivo !== p.usuarios) {
          const reales = cuenta.usuariosReales ?? null;
          campos.push({
            campo: 'usuarios',
            de: efectivo,
            a: p.usuarios,
            tipo: efectivo === null ? 'llenado' : 'pisada',
            pisaUsuariosReales: reales !== null && reales !== p.usuarios,
          });
        }
      }
    }
    for (const c of [
      cambioTexto('fecha_ultimo_contacto', cuenta.fechaUltimoContacto, p.fechaUltimoContacto, dia),
      cambioTexto('proximo_paso', cuenta.proximoPaso, p.proximoPaso, texto),
      cambioTexto('proximo_follow_up_fecha', cuenta.proximoFollowUpFecha, p.fechaProximoPaso, dia),
      cambioTexto('razon_perdida', cuenta.razonPerdida, p.razonPerdida, texto),
    ]) {
      if (c) campos.push(c);
    }

    if (estadoA === null && ownerA === null && campos.length === 0) {
      plan.sinCambios += 1;
      continue;
    }
    if (estadoA !== null) contar('estado', cuenta, cuenta.estado, estadoA);
    if (ownerA !== null) contar('owner', cuenta, cuenta.owner, ownerA);
    for (const c of campos) contar(c.campo, cuenta, c.de, c.a);
    plan.alinear.push({
      pageId: p.pageId,
      idEmpresa: cuenta.idEmpresa,
      nombre: cuenta.nombre,
      estadoDe: cuenta.estado,
      estadoA,
      ownerDe: cuenta.owner,
      ownerA,
      campos,
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
