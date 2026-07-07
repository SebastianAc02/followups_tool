import type { Canal } from '../db/validation.ts';

// Parte 5 campanas: la regla que resuelve un paso cuyo canal la empresa no tiene.
export type ReglaFaltante = 'reemplazar' | 'saltar' | 'cola';

type ContactoCanal = { email: string | null; telefono: string | null };
type PasoRequerido = { orden: number; canal: Canal };

// D3: correo <- email; llamada y whatsapp <- telefono (no distinguimos celular de
// fijo). Recorre TODOS los contactos de la empresa: basta que uno solo tenga el
// dato para que la empresa alcance ese canal.
export function canalesDisponibles(contactos: ContactoCanal[]): Set<Canal> {
  const disponibles = new Set<Canal>();
  for (const c of contactos) {
    if (c.email) disponibles.add('correo');
    if (c.telefono) {
      disponibles.add('llamada');
      disponibles.add('whatsapp');
    }
  }
  return disponibles;
}

export type Readiness = {
  estado: 'lista' | 'parcial' | 'sin_canal';
  // ordenes de los pasos que la empresa no puede correr (saltar/cola).
  pasosSinCanal: number[];
  // pasos reasignados a otro canal (regla reemplazar).
  reemplazos: { orden: number; de: Canal; a: Canal }[];
};

// Si la empresa no tiene NINGUN canal, ninguna regla la salva (sin_canal es un
// cortocircuito: no hay a quien reemplazar). Con al menos un canal, la regla
// resuelve PASO A PASO los que faltan:
//  - reemplazar: el paso usa el primer canal disponible de la empresa (queda
//    'lista', con el reemplazo anotado).
//  - saltar / cola: el paso queda marcado en pasosSinCanal; la empresa queda
//    'parcial'. La diferencia entre saltar y cola es de flujo de campana (que
//    pasa con la inscripcion), no de resolucion de canal: no se modela aca.
export function readinessEmpresa(
  disponibles: Set<Canal>,
  requeridos: PasoRequerido[] | Canal[],
  regla: ReglaFaltante,
): Readiness {
  const pasos = normalizar(requeridos);

  if (disponibles.size === 0) {
    return { estado: 'sin_canal', pasosSinCanal: pasos.map((p) => p.orden), reemplazos: [] };
  }

  const pasosSinCanal: number[] = [];
  const reemplazos: Readiness['reemplazos'] = [];
  for (const paso of pasos) {
    if (disponibles.has(paso.canal)) continue;
    if (regla === 'reemplazar') {
      const alterno = [...disponibles][0];
      reemplazos.push({ orden: paso.orden, de: paso.canal, a: alterno });
    } else {
      pasosSinCanal.push(paso.orden);
    }
  }

  const estado: Readiness['estado'] = pasosSinCanal.length > 0 ? 'parcial' : 'lista';
  return { estado, pasosSinCanal, reemplazos };
}

// Acepta tanto ['correo','llamada'] (orden implicito por posicion) como la forma
// completa [{orden,canal}] que trae la cadencia real.
function normalizar(requeridos: PasoRequerido[] | Canal[]): PasoRequerido[] {
  if (requeridos.length === 0) return [];
  if (typeof requeridos[0] === 'string') {
    return (requeridos as Canal[]).map((canal, i) => ({ orden: i + 1, canal }));
  }
  return requeridos as PasoRequerido[];
}
