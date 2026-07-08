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

// Diseno (escrito por Claude con deadline explicito de Sebastian, excepcion puntual al
// modo learning -- ver CLAUDE.md, mismo patron que las 3 preguntas resueltas en
// app/core/ports/envio.ts). Apollo numera el espaciado de sus emailer_steps de forma
// RELATIVA (cuanto esperar desde el paso anterior, wait_mode/wait_time -- ver
// planning/experimento-apollo.md, Hallazgo real #4), pero paso_cadencia.dia_offset es
// ABSOLUTO (offset desde el dia de inscripcion, ver schema.ts).
//
// Decision: el PRIMER paso (por orden, no por diaOffset) siempre espera 0 -- no importa
// su diaOffset absoluto, porque en nuestro modelo el contacto NUNCA entra a la secuencia
// de Apollo antes del dia exacto en que ese paso le toca (lo decide el materializador,
// no Apollo); para cuando add_contact_ids corre, el "esperar el offset" ya lo hizo
// nuestro propio worker. Los pasos siguientes esperan la diferencia contra el diaOffset
// del paso anterior (offset[N] - offset[N-1]), clamped a 0 por si dos pasos empatan en
// el mismo dia o el dato viniera desordenado -- Apollo no acepta wait negativo.
//
// Limitacion conocida, no resuelta aqui: esto asume que Apollo corre la secuencia de un
// tiron una vez inscrito el contacto. La tension real de fondo -- que nuestro propio
// motor de fechas quiere controlar CUANDO sale cada paso, no Apollo -- sigue abierta
// (ver experimento-apollo.md:319-327) y se resuelve cuando se conecte el envio real.
export function calcularWaitApollo(pasos: PasoOffset[]): WaitApollo[] {
  const ordenados = [...pasos].sort((a, b) => a.orden - b.orden);
  return ordenados.map((p, i) => {
    if (i === 0) return { orden: p.orden, waitMode: 'day', waitTime: 0 };
    const anterior = ordenados[i - 1];
    return { orden: p.orden, waitMode: 'day', waitTime: Math.max(0, p.diaOffset - anterior.diaOffset) };
  });
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
