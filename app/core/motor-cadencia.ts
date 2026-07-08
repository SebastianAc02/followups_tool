// Motor de cadencia EN SECO (Fase 4): logica pura, sin DB ni envios. Produce lo que
// "tocaria" hacer, no lo hace. V4.4 aporta el reparto A/B por peso; V4.6 agrega el
// calculo de fechas. Todo aca es determinista: mismas entradas -> mismas salidas, para
// que el motor sea testeable y predecible (nada de Math.random ni new Date() implicito).

import { sumarDias, diaSemana } from '../lib/date-utils';

export type VersionPeso = { id: number; peso: number };

// Reparto A/B determinista por peso. Dado el indice del destinatario (su posicion en el
// orden de inscripcion), elige que version le toca. Metodo: bucketing por
// indice mod pesoTotal. Para pesos [2,1] (total 3): posiciones 0,1 -> primera version,
// 2 -> segunda, y cicla. Exactamente proporcional en cada bloque de pesoTotal.
// Versiones con peso 0 no participan (una version apagada no debe recibir trafico).
export function elegirVersionPorPeso(versiones: VersionPeso[], indice: number): number {
  const conPeso = versiones.filter((v) => v.peso > 0);
  if (conPeso.length === 0) {
    throw new Error('no hay versiones con peso > 0 para repartir');
  }
  const total = conPeso.reduce((s, v) => s + v.peso, 0);
  // maneja indices negativos por si acaso (((i % n) + n) % n)
  let p = ((indice % total) + total) % total;
  for (const v of conPeso) {
    if (p < v.peso) return v.id;
    p -= v.peso;
  }
  // inalcanzable: p < total garantiza que alguna rama de arriba retorna.
  return conPeso[conPeso.length - 1].id;
}

// --- Motor de fechas (V4.6) -------------------------------------------------

export type PasoOffset = { orden: number; diaOffset: number };

export type ConfigCalendario = {
  // dias de la semana en los que NO se manda nada (0=domingo .. 6=sabado).
  diasBloqueados: number[];
  // si un paso cae en dia bloqueado, se corre al siguiente dia habil o al anterior.
  corrimiento: 'siguiente' | 'anterior';
};

// Corre una fecha fuera de los dias bloqueados segun la regla de corrimiento. Guard
// anti-loop: si toda (o casi toda) la semana esta bloqueada, no hay dia habil y se
// lanza en vez de girar para siempre.
function ajustarPorBloqueados(iso: string, config: ConfigCalendario): string {
  if (config.diasBloqueados.length === 0) return iso;
  const paso = config.corrimiento === 'siguiente' ? 1 : -1;
  let fecha = iso;
  let guard = 0;
  while (config.diasBloqueados.includes(diaSemana(fecha))) {
    fecha = sumarDias(fecha, paso);
    if (++guard > 14) throw new Error('el corrimiento no converge: no queda ningun dia habil en la semana');
  }
  return fecha;
}

export type PasoCalendario = { orden: number; diaOffset: number; fechaNatural: string; fecha: string };

// Calendario PLANEADO de una cadencia (la vista "asi se ve en accion", V4.7): asume que
// ningun paso se atrasa. Fecha natural = anchor + diaOffset; fecha = esa, corrida fuera
// de los dias bloqueados. No decide que esta debido hoy (eso es proximoPasoDebido); solo
// dibuja el plan ideal.
export function calcularCalendario(pasos: PasoOffset[], anchor: string, config: ConfigCalendario): PasoCalendario[] {
  return [...pasos]
    .sort((a, b) => a.orden - b.orden)
    .map((p) => {
      const fechaNatural = sumarDias(anchor, p.diaOffset);
      return { orden: p.orden, diaOffset: p.diaOffset, fechaNatural, fecha: ajustarPorBloqueados(fechaNatural, config) };
    });
}

// --- Traduccion a Apollo (subir/editar copy, sesion 2026-07-08) ------------

export type WaitApollo = { orden: number; waitMode: 'day'; waitTime: number };

// TODO (Sebastian): Apollo numera el espaciado de sus emailer_steps de forma RELATIVA
// (cuanto esperar desde el paso anterior, wait_mode/wait_time -- ver
// planning/experimento-apollo.md, Hallazgo real #4), pero paso_cadencia.dia_offset es
// ABSOLUTO (offset desde el dia de inscripcion, ver schema.ts). Hay que traducir un
// modelo al otro para poder subir los pasos via POST /emailer_steps, y no hay una
// unica respuesta correcta -- ver la conversacion en la sesion de hoy para las
// preguntas abiertas (wait del primer paso, offsets empatados, dias bloqueados).
//
// Implementa esta funcion. calcularWaitApollo(pasos) recibe los pasos de UNA cadencia
// (mismo tipo PasoOffset que ya usa calcularCalendario) y devuelve, por cada uno, cuanto
// tiene que esperar Apollo desde el paso anterior antes de mandarlo.
export function calcularWaitApollo(pasos: PasoOffset[]): WaitApollo[] {
  throw new Error('calcularWaitApollo: pendiente de diseno (Sebastian)');
}

// Un paso ya ejecutado, con la fecha REAL en que salio (no la planeada).
export type EjecutadoPaso = { orden: number; fechaReal: string };

export type EstadoInscripcion = {
  anchor: string; // fecha_inscripcion (dia 0)
  ejecutados: EjecutadoPaso[];
};

export type PasoDebido = { orden: number; diaOffset: number; fechaObjetivo: string };

// El corazon del motor: dado el estado real de una inscripcion, que paso (si alguno) toca
// HOY. Anti-rafaga y re-anclaje por construccion: el objetivo del proximo paso se mide
// desde la fecha REAL del paso anterior (no desde el anchor original), asi que solo puede
// haber UN paso debido a la vez. Tras un apagon del worker, dispara el proximo paso y el
// que sigue se re-ancla al dia real de este; nunca salen los atrasados en rafaga.
export function proximoPasoDebido(
  pasos: PasoOffset[],
  estado: EstadoInscripcion,
  hoy: string,
  config: ConfigCalendario,
): PasoDebido | null {
  const ordenados = [...pasos].sort((a, b) => a.orden - b.orden);
  const hechos = new Set(estado.ejecutados.map((e) => e.orden));
  const siguiente = ordenados.find((p) => !hechos.has(p.orden));
  if (!siguiente) return null; // cadencia terminada

  const offsetPorOrden = new Map(ordenados.map((p) => [p.orden, p.diaOffset]));
  const prevEjec = [...estado.ejecutados].sort((a, b) => a.orden - b.orden).at(-1);

  let fechaObjetivo: string;
  if (prevEjec) {
    // re-anclaje: desde la fecha real del ultimo paso ejecutado + el salto de offsets.
    const delta = siguiente.diaOffset - (offsetPorOrden.get(prevEjec.orden) ?? 0);
    fechaObjetivo = ajustarPorBloqueados(sumarDias(prevEjec.fechaReal, Math.max(0, delta)), config);
  } else {
    // aun no se ejecuta nada: el primer paso se mide desde el anchor.
    fechaObjetivo = ajustarPorBloqueados(sumarDias(estado.anchor, siguiente.diaOffset), config);
  }

  if (fechaObjetivo <= hoy) {
    return { orden: siguiente.orden, diaOffset: siguiente.diaOffset, fechaObjetivo };
  }
  return null;
}
