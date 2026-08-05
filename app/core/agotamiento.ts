// Propuesta de tandas (integraciones/propuesta-tandas.md en el brain), punto 4 del orden
// propuesto: "Contador de toques sin respuesta y umbral por segmento". Pura: sin DB, sin
// I/O, mismo criterio que embudo.ts/detectar-clic-escaner.ts -- recibe arreglos ya leidos y
// devuelve numeros y clasificaciones auditables.
//
// Por que hace falta (medido el 2026-08-04 armando la vista de tandas a mano): la tanda
// 'enfriandose' vs 'agotada' hoy se decide en la cabeza del operador, cuenta sin cuenta. Sin
// un contador y un umbral explicitos, dos operadores (o el mismo operador dos dias distintos)
// sacan una cuenta a on hold en puntos distintos, y "esta agotada" deja de ser una pregunta
// que la herramienta pueda contestar.
import { RESULTADOS_CONTESTO, type Resultado } from '../db/validation.ts';

// Lo minimo de un toque que este archivo necesita para contar. A proposito NO es
// ToqueActividad (app/db/repository.ts): el core no importa el Repository (esa dependencia
// va al reves -- ver embudo.ts, "NO importa DB"), y este calculo no necesita las otras ~20
// columnas de un toque, solo estas cuatro.
export type ToqueParaAgotamiento = {
  resultado: Resultado | null;
  // 'whatsapp_entrante' identifica un mensaje que llego, no un toque que salio (ver
  // registrarToqueEntrante en core/llego-respuesta.ts). Cualquier otro valor ('cockpit',
  // 'notion_toques', etc.) es un toque nuestro.
  fuente: string;
  fechaDia?: string | null;
  fecha?: string | null;
};

// Un toque cuenta como respuesta del prospecto por dos caminos independientes (dictado del
// operador, 2026-08-04): el resultado de la conversacion (RESULTADOS_CONTESTO, ya filtrado en
// db/validation.ts a las variantes con conversacion real) o un WhatsApp entrante, que no pasa
// por `resultado` porque no es un toque nuestro. Los dos reinician la racha; ninguno de los
// dos necesita el otro.
function esRespuesta(t: ToqueParaAgotamiento): boolean {
  if (t.fuente === 'whatsapp_entrante') return true;
  return t.resultado !== null && (RESULTADOS_CONTESTO as readonly (Resultado | null)[]).includes(t.resultado);
}

// Clave de orden por toque: fechaDia (YYYY-MM-DD, columna normalizada del dominio) cuando
// existe, fecha (texto libre historico, ver schema.ts) como respaldo cuando no. Comparacion
// lexicografica basta porque las dos vienen en ISO: YYYY-MM-DD y YYYY-MM-DDTHH:mm:ss ordenan
// igual que el tiempo real.
function claveOrden(t: ToqueParaAgotamiento): string {
  return t.fechaDia ?? t.fecha ?? '';
}

// Cuenta, desde el toque MAS RECIENTE hacia atras, cuantos toques seguidos NO tuvieron
// respuesta del prospecto. Se detiene (no rompe, para) en el primer toque que SI cuenta como
// respuesta -- todo lo anterior a ese punto quedo reiniciado y no importa para este numero.
//
// Un mensaje entrante de WhatsApp participa del orden (es una fila de toque real) pero NUNCA
// suma al contador: si el evento mas reciente es un entrante, el contador es 0 aunque haya
// una racha larga detras, porque lo ultimo que paso fue una respuesta.
export function toquesSinRespuestaConsecutivos(toques: ToqueParaAgotamiento[]): number {
  // Copia antes de ordenar (Array.prototype.sort muta in place): el core no debe modificar
  // el arreglo que le paso el caller.
  const ordenados = [...toques].sort((a, b) => {
    const porFecha = claveOrden(b).localeCompare(claveOrden(a));
    // Empate en la clave principal (mismo dia, o los dos sin fechaDia): desempata por
    // `fecha` completa si la tienen, para no depender del orden de llegada del arreglo.
    if (porFecha !== 0) return porFecha;
    return (b.fecha ?? '').localeCompare(a.fecha ?? '');
  });

  let contador = 0;
  for (const t of ordenados) {
    if (esRespuesta(t)) break;
    contador++;
  }
  return contador;
}

// Los cinco segmentos de la propuesta de tandas. 'seguimiento_con_respuesta_previa' no es
// TIPOS_TOQUE.seguimiento (app/db/validation.ts): ese es el CANAL/clase del toque que se
// registra; este es el segmento de agotamiento, que exige ademas que la cuenta ya haya
// respondido alguna vez (ver yaRespondioAlgunaVez). Las otras cuatro comparten nombre con
// TIPOS_TOQUE a proposito -- son el mismo concepto de negocio visto desde el mismo angulo.
export type SegmentoAgotamiento = 'frio' | 'reactivacion' | 'seguimiento_con_respuesta_previa' | 'reunion' | 'cierre';

// Punto de partida dictado por el operador el 2026-08-04 (propuesta de tandas, campo 7:
// "Umbral de agotamiento por segmento, configurable"). Configurable de proposito: son
// hipotesis de arranque, no numeros medidos, y kaizen (regla 11 del brain) los va a mover
// con data real de cuantos toques sin respuesta preceden a una cuenta que si vuelve a
// responder. Vive como default de parametro, no adentro de la funcion, para que ese ajuste
// no obligue a tocar el codigo de estaAgotada/clasificarAgotamiento.
export const UMBRALES_AGOTAMIENTO: Record<SegmentoAgotamiento, number> = {
  frio: 3,
  reactivacion: 3,
  seguimiento_con_respuesta_previa: 4,
  reunion: 3,
  cierre: 5,
};

// 'Paso el umbral' (tanda 'agotada' de la propuesta) se lee como >= : llegar exacto al
// numero ya es la senal, no falta uno mas para confirmarla. La tanda 'enfriandose' (3 o mas
// sin respuesta, bajo el umbral del segmento) es responsabilidad de quien arme las tandas,
// no de esta funcion: aca solo se contesta la pregunta binaria "esta agotada o no".
export function estaAgotada(
  segmento: SegmentoAgotamiento,
  sinRespuesta: number,
  umbrales: Record<SegmentoAgotamiento, number> = UMBRALES_AGOTAMIENTO,
): boolean {
  return sinRespuesta >= umbrales[segmento];
}

export type ClasificacionAgotamiento = {
  segmento: SegmentoAgotamiento;
  sinRespuesta: number;
  umbral: number;
  agotada: boolean;
  // Texto trazable, mismo espiritu que VeredictoEscaner.detalle en detectar-clic-escaner.ts:
  // trae el conteo y el umbral contra el que se comparo, para que la clasificacion se pueda
  // auditar sin volver a correr el calculo. Requisito central de la propuesta de tandas
  // ("cada cuenta que devuelva la accion viaja con la regla que la clasifico y el valor que
  // la disparo").
  evidencia: string;
};

export function clasificarAgotamiento(
  segmento: SegmentoAgotamiento,
  sinRespuesta: number,
  umbrales: Record<SegmentoAgotamiento, number> = UMBRALES_AGOTAMIENTO,
): ClasificacionAgotamiento {
  const umbral = umbrales[segmento];
  const agotada = sinRespuesta >= umbral;
  const comparacion = agotada ? '>=' : '<';
  return {
    segmento,
    sinRespuesta,
    umbral,
    agotada,
    evidencia: `${sinRespuesta} toques sin respuesta consecutivos ${comparacion} umbral ${umbral} del segmento '${segmento}'`,
  };
}

// El segmento 'seguimiento_con_respuesta_previa' EXISTE solo si la cuenta respondio alguna
// vez en su historial (dictado del operador, punto 4 de la propuesta: "implica que la cuenta
// YA respondio alguna vez"). No se recibe como dato dado porque quien arma las tandas no
// deberia tener que rastrear el historial completo dos veces: una vez aca (que segmento
// aplica) y otra en toquesSinRespuestaConsecutivos (cuantos sin respuesta lleva). Mismo
// criterio de respuesta que esRespuesta: resultado en RESULTADOS_CONTESTO o whatsapp_entrante.
export function yaRespondioAlgunaVez(toques: ToqueParaAgotamiento[]): boolean {
  return toques.some(esRespuesta);
}
