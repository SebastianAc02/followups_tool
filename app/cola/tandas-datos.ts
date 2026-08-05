// Capa de datos de Pantalla 1 (Toques), paso 6 de la propuesta de tandas.
//
// No se reimplementa la clasificacion aca: tandasTool (app/mcp/tools.ts) YA hace el calculo
// completo -- es el mismo que usa Seguimiento y el MCP, "el mismo calculo, nadie mueve nada a
// mano". Lo unico que decide este archivo es COMO SE RECORRE la cola (que tanda se trabaja, en
// que posicion, como se avanza) y COMO SE ARMA la ficha minima de la cuenta actual (contacto,
// telefono, ultimo toque, proximo paso).
//
// Por que la pantalla vieja se rehizo (medido el 2026-08-04, propuesta de tandas): la lista de
// 20 cuentas devolvia la decision que la tarjeta de arriba ("Proximo paso") acababa de quitar, y
// elegir de esa lista era la fuga mental. Aca la tanda decide el orden -- TANDAS_LLAMABLES, en la
// prioridad fija de app/core/tandas.ts -- y el operador solo ejecuta una cuenta a la vez.
import { tandasTool } from '../mcp/tools';
import { TANDAS, type Tanda } from '../core/tandas';
import { getCuenta } from '../db/repository';

export type TandasDelDia = ReturnType<typeof tandasTool>;
export type GrupoTanda = TandasDelDia['tandas'][number];
export type CuentaTanda = GrupoTanda['cuentas'][number];

// Las tres tandas que NO son "para llamar ahora". 'fuera' ya viene omitida de tandasTool (no es
// del owner, o esta descartada/es de un aliado). 'esperar' es literal "nada que hacer ahora" (ya
// se toco hoy, o el canal esta muerto). 'bloqueado_por_tarea' es deuda del OPERADOR, no una
// llamada -- por eso vive en Seguimiento ("que esta esperando algo del operador"), no aca: nadie
// levanta el telefono para resolver una tarea propia.
const TANDAS_NO_LLAMABLES = new Set<Tanda>(['fuera', 'esperar', 'bloqueado_por_tarea']);

export const TANDAS_LLAMABLES: Tanda[] = TANDAS.filter((t) => !TANDAS_NO_LLAMABLES.has(t));

export function cargarTandasDelDia(idOrganizacion: number, owner: string | undefined): TandasDelDia {
  return tandasTool({ idOrganizacion, owner });
}

// Solo los grupos llamables, en el MISMO orden de prioridad de TANDAS -- no se reordena, el orden
// es la decision (ver app/core/tandas.ts). tandasTool ya omite las tandas vacias, asi que esto es
// un filtro, no un recorte de datos.
export function gruposLlamables(datos: TandasDelDia): GrupoTanda[] {
  return datos.tandas.filter((g) => TANDAS_LLAMABLES.includes(g.tanda));
}

export type PosicionCola = { tanda: Tanda; indice: number } | null;

// La posicion con la que arranca el dia: la primera tanda llamable que tenga cuentas, indice
// cero. Si el operador no pide explicito otra cosa (?tanda=&i=), esto es lo que ve al entrar --
// nunca una lista, siempre UNA cuenta.
export function posicionInicial(grupos: GrupoTanda[]): PosicionCola {
  const primero = grupos.find((g) => g.total > 0);
  return primero ? { tanda: primero.tanda, indice: 0 } : null;
}

// Resuelve lo que pide la URL contra lo que de verdad existe HOY: una tanda que ya se vacio (la
// cuenta que se iba a llamar se toco entretanto y paso a 'esperar') o un indice fuera de rango
// caen al default en vez de romper la pantalla o mostrar una fila que ya no esta.
export function resolverPosicion(grupos: GrupoTanda[], pedida: { tanda?: string; i?: string }): PosicionCola {
  const tanda = pedida.tanda as Tanda | undefined;
  const grupo = tanda ? grupos.find((g) => g.tanda === tanda) : undefined;
  if (!grupo || grupo.total === 0) return posicionInicial(grupos);
  const indice = Number(pedida.i ?? 0);
  if (!Number.isInteger(indice) || indice < 0 || indice >= grupo.total) return { tanda: grupo.tanda, indice: 0 };
  return { tanda: grupo.tanda, indice };
}

export function cuentaEnPosicion(grupos: GrupoTanda[], pos: PosicionCola): CuentaTanda | null {
  if (!pos) return null;
  const grupo = grupos.find((g) => g.tanda === pos.tanda);
  return grupo?.cuentas[pos.indice] ?? null;
}

// La proxima posicion, SIN volver a la lista (regla del rediseno): si quedan cuentas en la misma
// tanda, la siguiente; si se acabo, la primera cuenta de la proxima tanda llamable que tenga
// trabajo, siguiendo la prioridad de TANDAS_LLAMABLES. null = no queda nada por llamar hoy.
export function siguientePosicion(grupos: GrupoTanda[], pos: PosicionCola): PosicionCola {
  if (!pos) return null;
  const grupo = grupos.find((g) => g.tanda === pos.tanda);
  if (grupo && pos.indice + 1 < grupo.total) return { tanda: pos.tanda, indice: pos.indice + 1 };

  const desde = TANDAS_LLAMABLES.indexOf(pos.tanda) + 1;
  for (let idx = desde; idx < TANDAS_LLAMABLES.length; idx++) {
    const siguiente = grupos.find((g) => g.tanda === TANDAS_LLAMABLES[idx] && g.total > 0);
    if (siguiente) return { tanda: siguiente.tanda, indice: 0 };
  }
  return null;
}

// Cuantas cuentas en TOTAL quedan por llamar hoy en las tandas llamables (para el "4 de 12" no
// del grupo actual sino de la jornada completa, si hiciera falta en otra parte de la UI).
export function totalLlamable(grupos: GrupoTanda[]): number {
  return grupos.reduce((acc, g) => acc + g.total, 0);
}

export type FichaCuentaActual = {
  idEmpresa: string;
  nombre: string;
  contacto: string | null;
  cargo: string | null;
  telefono: string | null;
  proximoPaso: string | null;
  ultimoQuePaso: string | null;
  ultimoResultado: string | null;
  ultimaFecha: string | null;
};

// Lo minimo para decidir si llamar, de UNA cuenta: quien contesta, con que numero, que paso la
// vez pasada (para no repetir lo mismo) y que se le va a decir (proximoPaso, lo que ya se
// decidio que sigue). Nada de metricas ni badges: eso es justo lo que el rediseno saca de esta
// tarjeta -- ver app/cola/CuentaActual.tsx.
export function fichaCuentaActual(idEmpresa: string, idOrganizacion: number): FichaCuentaActual | null {
  const { emp, contactos, toques } = getCuenta(idEmpresa, idOrganizacion);
  if (!emp) return null;
  const principal = contactos.find((c) => c.esPrincipal === 1) ?? contactos[0] ?? null;
  // El ultimo toque REAL: un WhatsApp entrante no lo hizo el operador y no responde "que le
  // dijiste la vez pasada" (mismo criterio de fuente que el resto del repo, ver agotamiento.ts).
  const ultimo = toques.find((t) => t.fuente !== 'whatsapp_entrante') ?? null;
  return {
    idEmpresa: emp.id,
    nombre: emp.nombre ?? idEmpresa,
    contacto: principal?.nombre ?? null,
    cargo: principal?.cargo ?? null,
    telefono: principal?.telefono ?? null,
    proximoPaso: emp.proximoPaso ?? null,
    ultimoQuePaso: ultimo?.quePaso ?? null,
    ultimoResultado: ultimo?.resultado ?? null,
    ultimaFecha: ultimo?.fecha ?? null,
  };
}
