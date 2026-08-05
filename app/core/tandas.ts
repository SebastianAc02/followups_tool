// La clasificacion en tandas (propuesta de tandas, 2026-08-04, paso 5). Pura: sin DB y sin I/O,
// mismo criterio que agotamiento.ts y embudo.ts.
//
// QUE RESUELVE, medido: nueve tandas sobre 95 cuentas costaron diez consultas distintas y cuatro
// correcciones que salieron de la memoria del operador, no de ningun dato. Cada correccion tumbo
// cuentas y obligo a rehacer la lista entera. Esa clasificacion vivia en dos sitios donde nadie
// podia consultarla: repartida entre cuatro fuentes, y en la cabeza del operador.
//
// EL ORDEN DE LAS REGLAS ES LA DECISION, no un detalle. Una cuenta cumple varias condiciones a la
// vez casi siempre, y la primera que matchea decide si se llama o no. Cada salto de prioridad de
// aca abajo tiene su prueba en tandas.test.ts: sin ellas, reordenar dos lineas cambia a quien se
// llama manana y nada se pone rojo.
import { toquesSinRespuestaConsecutivos, yaRespondioAlgunaVez, UMBRALES_AGOTAMIENTO, type ToqueParaAgotamiento, type SegmentoAgotamiento } from './agotamiento.ts';

// En orden de PRIORIDAD, que es como se evaluan. La prueba fija este orden exacto para que
// reordenarlo sea una decision visible.
export const TANDAS = [
  'fuera',
  'esperar',
  'bloqueado_por_tarea',
  'cierre',
  'reunion',
  'respondio',
  'agotada',
  'enfriandose',
  'rellamada',
  'frio',
  'cadencia',
  'sin_campana',
] as const;
export type Tanda = (typeof TANDAS)[number];

type Evidencia = { campo: string; valor: string | null; fuente: string | null; fecha: string | null; quien: string | null };

type ClasificacionAliadoMin = { aliado: string; verificado: boolean; advertencia: string | null; heredadoDe: string | null; evidencia: Evidencia };
type ClasificacionDescarteMin = { descartada: boolean; motivo: string | null; nota: string | null; fechaRetorno: string | null; vigente: boolean; evidencia: Evidencia };

export type CuentaParaTanda = {
  idEmpresa: string;
  nombre: string;
  owner: string | null;
  estadoNotion: string | null;
  usuarios: number | null;
  // De donde salio el tamano. 'notion' es el unico confirmado: produccion trae numeros inventados
  // (UICOM figuraba con 3.000 y tiene 60) y el tamano decide a quien se llama primero.
  usuariosFuente: string | null;
  aliado: ClasificacionAliadoMin;
  descarte: ClasificacionDescarteMin;
  tareaBloqueante: string | null;
  tareaBloqueanteDesde: string | null;
  tieneCadencia: boolean;
  canalMuerto: boolean;
  // TODOS los toques de la cuenta, incluidos los entrantes de WhatsApp: el contador de racha los
  // necesita para saber que la racha se reinicio.
  toques: ToqueParaAgotamiento[];
  // El dia del ultimo toque REAL (no entrante). Separado de `toques` porque responde otra pregunta:
  // si ya se trabajo la cuenta hoy.
  ultimoToqueDia: string | null;
};

export type OpcionesTanda = {
  hoy: string;
  // El piso de tamano por debajo del cual una cuenta no se llama a mano.
  piso: number;
  // Cuando viene, las cuentas de otro dueno salen fuera. Sin el, el dueno no descarta a nadie.
  owner?: string;
  umbrales?: Record<SegmentoAgotamiento, number>;
};

export type ResultadoTanda = {
  idEmpresa: string;
  cuenta: string;
  tanda: Tanda;
  // Que regla la clasifico. Es lo que permite auditar la lista sin rehacerla: sin esto, una cuenta
  // mal puesta obliga a recalcular las 95 a mano para encontrar por que cayo donde cayo.
  regla: string;
  evidencia: Evidencia;
  usuarios: { valor: number | null; fuente: string | null; confirmado: boolean };
  // Lo que la cuenta arrastra sin que le impida entrar. Una cuenta sin verificar SALE en la lista,
  // marcada; no se esconde ni se aprueba.
  advertencias: string[];
  owner: string | null;
  // CUANTOS DIAS LLEVA QUIETA EN ESTE ESTADO. Es la pregunta que la pantalla de Seguimiento no sabe
  // responder hoy: una cuenta con 20 dias en "tocado sin respuesta" no es lo mismo que una de 2, y
  // hoy se ven iguales.
  //
  // Se calcula aca y no en la pantalla a proposito. Pedirle a la UI que reste fechas es como se
  // producen dos respuestas distintas a la misma pregunta, y ademas la fecha de referencia CAMBIA
  // segun la tanda: una cuenta bloqueada cuenta desde que se bloqueo, no desde su ultimo toque,
  // porque lo que duele es que la tarea lleve dos semanas sin hacerse.
  //
  // null cuando no hay fecha de referencia. NO cero: una cuenta sin toques no lleva "cero dias
  // quieta", lleva un tiempo desconocido, y devolver cero la pondria de primera en un orden de mas
  // viejo a mas nuevo, que es justo al reves de la verdad.
  diasEnEstado: number | null;
};

function diasEntre(desde: string | null, hasta: string): number | null {
  if (!desde) return null;
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.floor((b - a) / 86400000);
}

const ETAPAS_CIERRE = ['cierre_documentacion', 'contrato', 'firma', 'negociacion'];
const ETAPA_REUNION = 'reunion_agendada';

// Los tres aliados confirmados. sin_verificar y ninguno_verificado NO sacan a nadie, y por razones
// opuestas: el primero porque nadie miro, el segundo porque ya se verifico que la cuenta es propia.
const ALIADOS_QUE_SACAN = ['sae_plus', 'ultimo_kilometro', 'integrapay'];

const SIN_EVIDENCIA: Evidencia = { campo: '', valor: null, fuente: null, fecha: null, quien: null };

// De que segmento es la cuenta, para saber contra que umbral se mide su racha. Se deriva de la
// etapa y del historial de respuesta, NO del tipo del ultimo toque: el tipo puede faltar (es
// opcional a proposito) y una cuenta sin tipo no puede quedarse sin umbral.
function segmentoDe(c: CuentaParaTanda): SegmentoAgotamiento {
  if (c.estadoNotion && ETAPAS_CIERRE.includes(c.estadoNotion)) return 'cierre';
  if (c.estadoNotion === ETAPA_REUNION) return 'reunion';
  if (yaRespondioAlgunaVez(c.toques)) return 'seguimiento_con_respuesta_previa';
  // on_hold es la cuenta que se va a reactivar; cualquier otra cosa sin respuesta previa es fria.
  return c.estadoNotion === 'on_hold' ? 'reactivacion' : 'frio';
}

function advertenciasDe(c: CuentaParaTanda): string[] {
  const out: string[] = [];
  if (!c.aliado.verificado) out.push(`aliado sin verificar: nadie confirmo de quien es esta cuenta, entra marcada`);
  // El tamano solo se da por bueno cuando viene de Notion. Produccion trae numeros inventados y el
  // tamano decide si la cuenta califica y a quien se llama primero.
  if (c.usuarios == null) out.push('usuarios sin dato: la cuenta no se descarta por tamano, nadie la midio');
  else if (c.usuariosFuente !== 'notion') out.push(`usuarios sin confirmar (fuente ${c.usuariosFuente ?? 'desconocida'}): el numero no viene de Notion`);
  return out;
}

export function clasificarTanda(c: CuentaParaTanda, opts: OpcionesTanda): ResultadoTanda {
  const advertencias = advertenciasDe(c);
  const base = {
    idEmpresa: c.idEmpresa,
    cuenta: c.nombre,
    owner: c.owner,
    usuarios: {
      valor: c.usuarios,
      fuente: c.usuariosFuente,
      // Confirmado SOLO desde Notion. Es la regla dura del brain: los usuarios los pone Notion, y
      // produccion se usa cuando Notion esta vacio pero se reporta como estimado sin confirmar.
      confirmado: c.usuarios != null && c.usuariosFuente === 'notion',
    },
    advertencias,
  };
  const con = (tanda: Tanda, regla: string, evidencia: Evidencia): ResultadoTanda => ({
    ...base,
    tanda,
    regla,
    evidencia,
    // La fecha de la evidencia es la que corresponde a la regla que clasifico, asi que ya viene con
    // el significado correcto: el bloqueo para bloqueado_por_tarea, el ultimo toque para la racha.
    // El ultimo toque queda de respaldo para las tandas cuya evidencia no es una fecha (la etapa).
    diasEnEstado: diasEntre(evidencia.fecha ?? c.ultimoToqueDia, opts.hoy),
  });

  // 1. FUERA. Va de primera porque si la cuenta no es nuestra, su etapa, sus toques y su tamano son
  // irrelevantes. Los cuatro descartes que costaron rehacer la lista del 4-ago debieron salir aca.
  if (ALIADOS_QUE_SACAN.includes(c.aliado.aliado)) return con('fuera', 'aliado', c.aliado.evidencia);
  if (c.descarte.descartada) return con('fuera', `descarte:${c.descarte.motivo}`, c.descarte.evidencia);
  if (opts.owner && c.owner !== opts.owner) {
    return con('fuera', 'otro_dueno', { campo: 'owner', valor: c.owner, fuente: 'herramienta', fecha: null, quien: null });
  }

  // 2. ESPERAR, antes que la etapa. La tanda responde "que hago AHORA": una cuenta ya tocada hoy no
  // se vuelve a tocar hoy por mas que este en cierre. Si la etapa ganara, la cuenta mas caliente
  // del pipeline saldria todos los dias en la lista y se quemaria.
  if (c.ultimoToqueDia === opts.hoy) {
    return con('esperar', 'tocada_hoy', { campo: 'ultimo_toque', valor: c.ultimoToqueDia, fuente: 'herramienta', fecha: c.ultimoToqueDia, quien: null });
  }
  // Intel Go acumulo cuatro toques marcando una linea fuera de servicio. Con el canal muerto la
  // cuenta deja de salir a llamar en vez de gastar el quinto.
  if (c.canalMuerto) {
    return con('esperar', 'canal_muerto', { campo: 'canal_estado', valor: 'muerto', fuente: 'herramienta', fecha: null, quien: null });
  }

  // 3. BLOQUEADO POR TAREA, antes que la etapa porque lo que la desbloquea no es un toque. Jigartel
  // llevaba desde el 22-jul quieta por un numero de gerente que faltaba conseguir, y hoy eso se
  // esconde entre las que no contestan. No es que no contesten: es deuda propia.
  if (c.tareaBloqueante) {
    return con('bloqueado_por_tarea', 'tarea_del_operador', {
      campo: 'tarea_bloqueante',
      valor: c.tareaBloqueante,
      fuente: 'herramienta',
      fecha: c.tareaBloqueanteDesde,
      quien: null,
    });
  }

  const evidenciaEtapa: Evidencia = { campo: 'estado_notion', valor: c.estadoNotion, fuente: 'herramienta', fecha: null, quien: null };
  if (c.estadoNotion && ETAPAS_CIERRE.includes(c.estadoNotion)) return con('cierre', 'etapa', evidenciaEtapa);
  if (c.estadoNotion === ETAPA_REUNION) return con('reunion', 'etapa', evidenciaEtapa);

  // 4. SIN TOQUES. Se pregunta antes que la racha porque una racha de cero no distingue "nunca se
  // toco" de "se toco y contesto", y son dos trabajos distintos.
  const toquesReales = c.toques.filter((t) => t.fuente !== 'whatsapp_entrante');
  if (toquesReales.length === 0) {
    const evidenciaTamano: Evidencia = { campo: 'usuarios', valor: c.usuarios == null ? null : String(c.usuarios), fuente: c.usuariosFuente, fecha: null, quien: null };
    // Sin cadencia y sin toques la cuenta es invisible: nada le va a pasar nunca si nadie la ve. Va
    // antes que frio y cadencia porque las dos suponen que algo la esta trabajando.
    if (!c.tieneCadencia) return con('sin_campana', 'sin_cadencia_sin_toques', evidenciaTamano);
    // Sin tamano NO se cae a cadencia. Una cuenta sin usuarios no es una cuenta chica, es una cuenta
    // que nadie midio: AVIDTEL y JASZ tienen 5.000 cada una en Notion y produccion no les tiene
    // tamano, asi que las dos cuentas de on hold mas grandes eran invisibles en una lista armada
    // desde la herramienta. Ante la duda entra a frio, marcada.
    if (c.usuarios == null || c.usuarios >= opts.piso) return con('frio', 'sin_toques_pasa_piso', evidenciaTamano);
    return con('cadencia', 'sin_toques_bajo_piso', evidenciaTamano);
  }

  // 5. LA RACHA. sinRespuesta cuenta desde el toque mas reciente hacia atras y se reinicia con
  // cualquier respuesta del prospecto, incluido un WhatsApp entrante.
  const sinRespuesta = toquesSinRespuestaConsecutivos(c.toques);
  const segmento = segmentoDe(c);
  const umbral = (opts.umbrales ?? UMBRALES_AGOTAMIENTO)[segmento];
  const evidenciaRacha: Evidencia = {
    campo: 'toques_sin_respuesta',
    valor: `${sinRespuesta} sin respuesta, umbral ${umbral} (segmento ${segmento})`,
    fuente: 'herramienta',
    fecha: c.ultimoToqueDia,
    quien: null,
  };

  if (sinRespuesta === 0) return con('respondio', 'ultimo_toque_con_respuesta', evidenciaRacha);
  if (sinRespuesta >= umbral) return con('agotada', `paso_el_umbral:${segmento}`, evidenciaRacha);
  if (sinRespuesta >= 3) return con('enfriandose', `bajo_el_umbral:${segmento}`, evidenciaRacha);
  return con('rellamada', 'una_o_dos_sin_respuesta', evidenciaRacha);
}

export const _SIN_EVIDENCIA = SIN_EVIDENCIA;
