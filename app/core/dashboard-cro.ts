// Paso 7 de la propuesta al CRO (integraciones/propuesta-write-path.md en el brain): el
// tablero que responde lo que el CRO pregunta y ninguna metrica de hoy contesta. Pura: sin
// DB, sin I/O, mismo criterio que agotamiento.ts/embudo.ts -- recibe arreglos de toques ya
// leidos y devuelve numeros y clasificaciones auditables.
//
// Por que hace falta (medido el 2026-08-04 sobre el periodo desde el corte del 20-jul): el
// unico numero que existia era "96 toques", que no distingue un dia de 25 llamadas sin
// reunion de uno de 5 llamadas con dos reuniones. El doc del CRO pide siete cortes puntuales;
// "toques totales" no es uno de ellos a proposito (ver mixPorCanal/mixPorTipoToque: se
// exponen los MIX, nunca un total presentado como titular).
import { RESULTADOS_CONTESTO, RESULTADOS_REUNION_OCURRIDA, type Resultado } from '../db/validation.ts';
import { CLAVE_SIN_ETAPA } from './embudo.ts';

// Lo minimo de un toque que este archivo necesita. A proposito NO es ToqueActividad
// (app/db/repository.ts): el core no importa el Repository (esa dependencia va al reves --
// ver embudo.ts, "NO importa DB"), y ningun calculo de aca necesita las otras columnas de
// un toque real. `estado` es empresa.estadoNotion tal como lo trae ToqueActividad.estado: la
// etapa de la cuenta AL MOMENTO DE LA LECTURA, no un historico por toque.
export type ToqueDashboardCRO = {
  idEmpresa: string;
  canal: string | null;
  tipoToque: string | null;
  resultado: Resultado | null;
  // 'whatsapp_entrante' identifica un mensaje que llego, no un toque que salio (mismo campo
  // que ToqueParaAgotamiento.fuente en agotamiento.ts). Cualquier otro valor es un toque
  // nuestro.
  fuente: string;
  fechaDia: string | null;
  fecha: string | null;
  estado: string | null;
  reunionFechaPropuesta: string | null;
  reunionFechaOcurrida: string | null;
};

// ── (1) LLAMADAS POR REUNION CONSEGUIDA ───────────────────────────────────────────────────
// El costo de una reunion en llamadas. Medido el 2026-08-04: 69 llamadas / 11 reuniones
// propuestas = 6,3. El denominador es reunionFechaPropuesta (toda cuenta con fecha de reunion
// propuesta en el periodo), el mismo criterio que usa embudoReuniones() para 'propuestas' --
// no se inventa un segundo criterio para la misma pregunta.

export type LlamadasPorReunion = {
  llamadas: number;
  reunionesPropuestas: number;
  // null, NUNCA Infinity ni NaN, cuando no hubo ninguna reunion propuesta en el periodo: sin
  // denominador no hay tasa que calcular, y decir "0" o "Infinity" inventaria un numero que
  // el dato no sostiene.
  llamadasPorReunion: number | null;
};

export function llamadasPorReunionConseguida(toques: ToqueDashboardCRO[]): LlamadasPorReunion {
  const llamadas = toques.filter((t) => t.canal === 'llamada').length;
  const reunionesPropuestas = toques.filter((t) => t.reunionFechaPropuesta != null).length;
  return {
    llamadas,
    reunionesPropuestas,
    llamadasPorReunion: reunionesPropuestas === 0 ? null : llamadas / reunionesPropuestas,
  };
}

// ── (2) MIX POR CANAL ──────────────────────────────────────────────────────────────────────
// Medido el 2026-08-04: 69 llamada, 18 whatsapp, 8 reunion, 1 correo (total 96). Sin tope de
// canales validos a proposito: si aparece un canal que hoy no existe en CANALES_TOQUE
// (validation.ts), el mix lo muestra igual en vez de tragarselo.

export type MixPorCanal = {
  porCanal: Record<string, number>;
  total: number;
};

export function mixPorCanal(toques: ToqueDashboardCRO[]): MixPorCanal {
  const porCanal: Record<string, number> = {};
  for (const t of toques) {
    const k = t.canal ?? 'sin_canal';
    porCanal[k] = (porCanal[k] ?? 0) + 1;
  }
  return { porCanal, total: toques.length };
}

// ── (3) EMBUDO DE REUNIONES ───────────────────────────────────────────────────────────────
// Mismo par ocurridas/noShow que conteosActividad.reuniones en app/mcp/tools.ts (una reunion
// cuenta como ocurrida por reunionFechaOcurrida O por un resultado en
// RESULTADOS_REUNION_OCURRIDA -- los dos caminos existen porque una reunion importada de
// Notion puede traer una fecha de ocurrencia sin el resultado detallado, y una registrada por
// MCP puede traer el resultado sin que alguien haya llenado la fecha aparte).
//
// sinDesenlace es la resta que el doc del CRO trae mal hecha: cita "11 propuestas, 4
// ocurridas, 3 no-show, 7 sin desenlace", pero 4 + 3 = 7 y las propuestas son 11, asi que lo
// que queda sin desenlace es 11 - 4 - 3 = 4, no 7. Esta funcion hace la resta bien y devuelve
// lo que da, no lo que el doc citaba.

export type EmbudoReuniones = {
  propuestas: number;
  ocurridas: number;
  noShow: number;
  sinDesenlace: number;
};

export function embudoReuniones(
  toques: ToqueDashboardCRO[],
  resultadosOcurrida: readonly Resultado[] = RESULTADOS_REUNION_OCURRIDA,
): EmbudoReuniones {
  const propuestas = toques.filter((t) => t.reunionFechaPropuesta != null).length;
  const ocurridas = toques.filter(
    (t) => t.reunionFechaOcurrida != null || (t.resultado != null && resultadosOcurrida.includes(t.resultado)),
  ).length;
  const noShow = toques.filter((t) => t.resultado === 'no_llego').length;
  return { propuestas, ocurridas, noShow, sinDesenlace: propuestas - ocurridas - noShow };
}

// ── (4) MIX POR TIPO DE TOQUE ─────────────────────────────────────────────────────────────
// Copia el patron de conteosActividad (bloque `tipo`) en app/mcp/tools.ts. Medido el
// 2026-08-04: 30 de 96 toques traen tipoToque. Los 66 sin tipo van en su propia llave
// (toquesSinTipo), JAMAS repartidos entre los que si lo tienen -- un mix sobre 30 de 96
// presentado como si fuera el de los 96 es la lectura falsa que este bloque existe para
// hacer imposible.

export type MixPorTipoToque = {
  porTipo: Record<string, number>;
  toquesConTipo: number;
  toquesSinTipo: number;
};

export function mixPorTipoToque(toques: ToqueDashboardCRO[]): MixPorTipoToque {
  const conTipo = toques.filter((t): t is ToqueDashboardCRO & { tipoToque: string } => t.tipoToque != null);
  const porTipo: Record<string, number> = {};
  for (const t of conTipo) {
    porTipo[t.tipoToque] = (porTipo[t.tipoToque] ?? 0) + 1;
  }
  return {
    porTipo,
    toquesConTipo: conTipo.length,
    toquesSinTipo: toques.length - conTipo.length,
  };
}

// ── (5) RIESGO: CIERRES SIN MOVIMIENTO ────────────────────────────────────────────────────
// Cuentas en etapa de cierre cuyo ultimo toque tiene mas de N dias. N configurable (default
// 7, punto de partida sin medir, igual que UMBRALES_AGOTAMIENTO en agotamiento.ts: hipotesis
// de arranque que kaizen va a mover con data real). etapasCierre tambien configurable por la
// misma razon -- el default son las dos bandas de FUNNEL_ETAPAS (app/db/funnel.ts) que van
// DESPUES de 'oportunidad' y ANTES de 'firma_pago' (que ya es cuenta ganada, no en riesgo).
//
// "Paso el umbral" se lee >= , mismo criterio que estaAgotada en agotamiento.ts: llegar
// exacto al numero ya es la senal.
const ETAPAS_CIERRE_DEFAULT: readonly string[] = ['cierre_documentacion', 'enviar_contrato'];

// UTC en las dos puntas para que el resultado no dependa del huso del proceso (mismo patron
// que diasDeAtraso en app/mcp/tools.ts).
function diaUTC(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export type CuentaCierreSinMovimiento = {
  idEmpresa: string;
  estado: string;
  // YYYY-MM-DD del toque mas reciente de la cuenta que si tenia fechaDia usable.
  fechaUltimoToque: string;
  diasSinMovimiento: number;
};

export type RiesgoCierresSinMovimiento = {
  umbralDias: number;
  // Cuentas en etapa de cierre con al menos un toque fechado -- el N sobre el que se decidio
  // quien entra o no a `enRiesgo`.
  cuentasEvaluadas: number;
  // Cuentas en etapa de cierre cuyos toques NO traen fechaDia: no se puede medir hace cuanto
  // no se mueven, asi que se excluyen de `enRiesgo` en vez de inventarles un dia, y se
  // reportan aparte para que el conteo de arriba no se lea como completo.
  cuentasSinFechaUtil: number;
  enRiesgo: CuentaCierreSinMovimiento[];
};

export function cierresSinMovimiento(
  toques: ToqueDashboardCRO[],
  hoy: string,
  umbralDias = 7,
  etapasCierre: readonly string[] = ETAPAS_CIERRE_DEFAULT,
): RiesgoCierresSinMovimiento {
  const enEtapaCierre = toques.filter((t) => t.estado != null && etapasCierre.includes(t.estado));

  const porEmpresa = new Map<string, ToqueDashboardCRO[]>();
  for (const t of enEtapaCierre) {
    const lista = porEmpresa.get(t.idEmpresa);
    if (lista) lista.push(t);
    else porEmpresa.set(t.idEmpresa, [t]);
  }

  let cuentasEvaluadas = 0;
  let cuentasSinFechaUtil = 0;
  const enRiesgo: CuentaCierreSinMovimiento[] = [];

  for (const [idEmpresa, toquesCuenta] of porEmpresa) {
    const fechas = toquesCuenta.map((t) => t.fechaDia).filter((f): f is string => f != null);
    if (fechas.length === 0) {
      cuentasSinFechaUtil++;
      continue;
    }
    cuentasEvaluadas++;
    // Orden lexicografico basta: fechaDia siempre viene YYYY-MM-DD (mismo criterio que
    // claveOrden en agotamiento.ts).
    const fechaUltimoToque = [...fechas].sort().at(-1) as string;
    const diasSinMovimiento = Math.round((diaUTC(hoy) - diaUTC(fechaUltimoToque)) / 86_400_000);
    if (diasSinMovimiento >= umbralDias) {
      enRiesgo.push({
        idEmpresa,
        // El estado es el mismo para todos los toques de la cuenta (viene de empresa.estado
        // AL MOMENTO DE LA LECTURA, no historico por toque) -- toquesCuenta[0] alcanza.
        estado: toquesCuenta[0].estado as string,
        fechaUltimoToque,
        diasSinMovimiento,
      });
    }
  }

  return { umbralDias, cuentasEvaluadas, cuentasSinFechaUtil, enRiesgo };
}

// ── (6) TASA DE RESPUESTA PARTIDA POR ETAPA ───────────────────────────────────────────────
// El doc del CRO lo pide explicito: el agregado esconde que la tasa varia fuerte por etapa
// (arriba de la reunion la conversacion ya esta caliente; antes, en frio, es otra cosa). Esta
// funcion parte por `estado` (la etapa de la cuenta) y devuelve la tasa por etapa Y el
// agregado, cada una con su N -- sin N no se puede auditar, que es la regla de diseno de todo
// este archivo.
//
// Los entrantes de WhatsApp (fuente='whatsapp_entrante') NO son trabajo del operador y no
// entran a NINGUN denominador de esfuerzo (mismo criterio que actividadTool en mcp/tools.ts,
// `ejecutados`/`entrantes`): se filtran antes de agrupar, no despues.

export type TasaPorEtapa = {
  // Valor de `estado` (estadoNotion), o CLAVE_SIN_ETAPA (embudo.ts) cuando el toque no trae
  // etapa. '__agregado__' para la fila que suma todas las etapas.
  etapa: string;
  contestados: number;
  total: number;
  // null, NUNCA NaN, cuando total es 0: sin denominador no hay tasa.
  tasa: number | null;
};

export type TasaRespuestaPorEtapa = {
  porEtapa: TasaPorEtapa[];
  agregado: TasaPorEtapa;
};

const CLAVE_AGREGADO = '__agregado__';

function calcularTasa(grupo: ToqueDashboardCRO[], etapa: string, resultadosContesto: readonly Resultado[]): TasaPorEtapa {
  const contestados = grupo.filter((t) => t.resultado != null && resultadosContesto.includes(t.resultado)).length;
  const total = grupo.length;
  return { etapa, contestados, total, tasa: total === 0 ? null : contestados / total };
}

export function tasaRespuestaPorEtapa(
  toques: ToqueDashboardCRO[],
  resultadosContesto: readonly Resultado[] = RESULTADOS_CONTESTO,
): TasaRespuestaPorEtapa {
  const ejecutados = toques.filter((t) => t.fuente !== 'whatsapp_entrante');

  const porEstado = new Map<string, ToqueDashboardCRO[]>();
  for (const t of ejecutados) {
    const k = t.estado ?? CLAVE_SIN_ETAPA;
    const lista = porEstado.get(k);
    if (lista) lista.push(t);
    else porEstado.set(k, [t]);
  }

  const porEtapa = [...porEstado.entries()].map(([etapa, grupo]) => calcularTasa(grupo, etapa, resultadosContesto));
  const agregado = calcularTasa(ejecutados, CLAVE_AGREGADO, resultadosContesto);

  return { porEtapa, agregado };
}

// ── (7) RESPUESTAS ENTRANTES DE WHATSAPP ──────────────────────────────────────────────────
// La mitad de la conversacion que hoy no entra en ninguna metrica (doc del CRO). Medido el
// 2026-08-04: 143 mensajes en 15 cuentas. A proposito en su PROPIO bloque y no mezclado en
// ningun conteo de actividad ni denominador de esfuerzo (regla de diseno de este archivo,
// mismo criterio que `entrantes` en actividadTool, mcp/tools.ts): un entrante es la senal de
// que el prospecto respondio, no trabajo que hizo el operador.

export type RespuestasEntrantesWhatsapp = {
  totalMensajes: number;
  cuentasUnicas: number;
};

export function respuestasEntrantesWhatsapp(toques: ToqueDashboardCRO[]): RespuestasEntrantesWhatsapp {
  const entrantes = toques.filter((t) => t.fuente === 'whatsapp_entrante');
  const cuentas = new Set(entrantes.map((t) => t.idEmpresa));
  return { totalMensajes: entrantes.length, cuentasUnicas: cuentas.size };
}
