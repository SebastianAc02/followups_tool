// Cuatro metricas de actividad por canal, pedidas sueltas del panel (2026-08-05). Pura: sin
// DB, sin I/O, mismo criterio que agotamiento.ts/dashboard-cro.ts -- recibe arreglos de toques
// ya leidos y devuelve numeros y clasificaciones auditables.
import { RESULTADOS_CONTESTO, type Resultado } from '../db/validation.ts';

// Lo minimo de un toque que este archivo necesita. A proposito NO es ToqueActividad
// (app/db/repository.ts): el core no importa el Repository (dependencia va al reves, ver
// embudo.ts "NO importa DB"). `esPrimerToqueDeLaCuenta` la calcula el repository (es el unico
// que puede saber si hubo un toque anterior de la cuenta); este archivo solo la recibe y la usa.
export type ToqueCanal = {
  idEmpresa: string;
  canal: string | null;
  resultado: Resultado | null;
  // 'whatsapp_entrante' identifica un mensaje que llego, no un toque que salio (mismo campo
  // que ToqueParaAgotamiento.fuente en agotamiento.ts y ToqueDashboardCRO.fuente en
  // dashboard-cro.ts). Cualquier otro valor es un toque nuestro.
  fuente: string;
  fechaDia: string | null;
  fecha: string | null;
  esPrimerToqueDeLaCuenta: boolean;
};

// ── (1) AGRUPACION DE CANAL ───────────────────────────────────────────────────────────────
// El operador piensa en dos canales de contacto (texto y llamada), no en los cuatro valores
// de CANALES_TOQUE (validation.ts: llamada, whatsapp, correo, reunion). 'reunion' queda
// AFUERA de los dos: una reunion no es un canal por el que se contacta a alguien, es un
// desenlace de un contacto que ya se dio por otro canal. Un `canal` fuera de esos cuatro
// valores conocidos (o null) cae en sin_canal en vez de que la funcion le invente un grupo.

export type GrupoCanal = 'texto' | 'llamada' | 'reunion' | 'sin_canal';

export function grupoDeCanal(canal: string | null): GrupoCanal {
  if (canal === 'whatsapp' || canal === 'correo') return 'texto';
  if (canal === 'llamada') return 'llamada';
  if (canal === 'reunion') return 'reunion';
  return 'sin_canal';
}

export type ToquesPorGrupo = {
  texto: number;
  llamada: number;
  reunion: number;
  sinCanal: number;
  total: number;
};

export function toquesPorGrupo(toques: ToqueCanal[]): ToquesPorGrupo {
  const out: ToquesPorGrupo = { texto: 0, llamada: 0, reunion: 0, sinCanal: 0, total: toques.length };
  for (const t of toques) {
    const grupo = grupoDeCanal(t.canal);
    if (grupo === 'texto') out.texto++;
    else if (grupo === 'llamada') out.llamada++;
    else if (grupo === 'reunion') out.reunion++;
    else out.sinCanal++;
  }
  return out;
}

// ── (2) CONNECT RATE ──────────────────────────────────────────────────────────────────────
// De las llamadas hechas (canal='llamada'), cuantas llegaron a hablar con alguien
// (resultado en RESULTADOS_CONTESTO, mismo criterio que tasaRespuestaPorEtapa en
// dashboard-cro.ts). Una llamada SIN resultado no es una llamada que no conecto: es una
// llamada que nadie califico todavia. Meterla del lado de `noConectadas` inflaria la tasa a
// la baja con un dato que no existe, asi que sale del denominador y va aparte en
// `sinResultado`, auditable por separado.

export type ConnectRate = {
  llamadas: number;
  conectadas: number;
  noConectadas: number;
  sinResultado: number;
  // null, NUNCA NaN ni 0, cuando el denominador (conectadas + noConectadas) es cero: sin
  // llamadas calificadas no hay tasa que calcular.
  tasa: number | null;
};

export function connectRate(
  toques: ToqueCanal[],
  resultadosContesto: readonly Resultado[] = RESULTADOS_CONTESTO,
): ConnectRate {
  const llamadas = toques.filter((t) => grupoDeCanal(t.canal) === 'llamada');
  const sinResultado = llamadas.filter((t) => t.resultado == null).length;
  const conectadas = llamadas.filter((t) => t.resultado != null && resultadosContesto.includes(t.resultado)).length;
  const noConectadas = llamadas.length - conectadas - sinResultado;
  const denominador = conectadas + noConectadas;
  return {
    llamadas: llamadas.length,
    conectadas,
    noConectadas,
    sinResultado,
    tasa: denominador === 0 ? null : conectadas / denominador,
  };
}

// ── (3) DEDUPLICACION DE TEXTO ────────────────────────────────────────────────────────────
// El operador describio la regla de colapsar toques de texto de dos formas que dan numeros
// distintos (2026-08-05), asi que las dos existen y el operador elige. Las dos comparten la
// misma base cruda: toques de texto (grupoDeCanal='texto') que NO son entrantes de WhatsApp.
// Un entrante (fuente='whatsapp_entrante') nunca lo mandamos nosotros, asi que jamas suma a
// `crudos` ni a `deduplicados` en ninguno de los dos modos -- esa es la parte que no cambia
// entre modos. Lo que cambia es como se agrupan los toques propios:
//   'dia'          -- varios toques de texto a la misma cuenta el mismo fechaDia son uno.
//   'conversacion' -- una racha de toques a la misma cuenta donde entre uno y el siguiente no
//                     pasaron mas de `diasDeSilencio` dias es uno, sin importar cuantos dias
//                     distintos abarque la racha. Pasado ese silencio, empieza otra.
// `colapsados` = crudos - deduplicados: como los dos modos comparten `crudos`, colapsados es
// exactamente el numero que explica la diferencia entre los dos modos sobre el mismo fixture.

export type ModoDedupTexto = 'dia' | 'conversacion';

export type TextoDeduplicado = {
  modo: ModoDedupTexto;
  crudos: number;
  deduplicados: number;
  colapsados: number;
};

// Mismo patron que diaUTC en dashboard-cro.ts: UTC en las dos puntas para que el calculo de
// dias de silencio no dependa del huso del proceso que corre esto.
function diaUTC(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

// fechaDia (YYYY-MM-DD normalizado) manda; fecha (texto libre historico) es el respaldo.
// null cuando ninguna de las dos trae algo parseable -- ese toque no se puede ubicar en el
// tiempo con certeza.
function diaDeToque(t: ToqueCanal): number | null {
  const iso = t.fechaDia ?? t.fecha;
  return iso == null ? null : diaUTC(iso);
}

// Clave de orden ascendente por toque, mismo criterio que claveOrden en agotamiento.ts
// (comparacion lexicografica basta porque fechaDia/fecha vienen en ISO) pero de mas viejo a
// mas nuevo, porque el modo 'conversacion' necesita caminar la racha hacia adelante en el
// tiempo para decidir donde corta el silencio.
function claveOrdenAsc(t: ToqueCanal): string {
  return t.fechaDia ?? t.fecha ?? '';
}

export function textoDeduplicado(
  toques: ToqueCanal[],
  opciones: { modo: ModoDedupTexto; diasDeSilencio?: number },
): TextoDeduplicado {
  const { modo, diasDeSilencio = 7 } = opciones;
  const texto = toques.filter((t) => grupoDeCanal(t.canal) === 'texto');
  const propios = texto.filter((t) => t.fuente !== 'whatsapp_entrante');
  const crudos = propios.length;

  let deduplicados: number;

  if (modo === 'dia') {
    const claves = new Set<string>();
    let sinFecha = 0;
    for (const t of propios) {
      if (t.fechaDia == null) {
        // Sin fechaDia no se puede probar que cayo el mismo dia que otro toque: cuenta
        // individual en vez de colapsarlo a ciegas con cualquier otra cosa (mismo criterio
        // defensivo que cierresSinMovimiento en dashboard-cro.ts, que excluye en vez de
        // inventar un dia).
        claves.add(`__sin_fecha_${sinFecha++}__`);
      } else {
        claves.add(`${t.idEmpresa}|${t.fechaDia}`);
      }
    }
    deduplicados = claves.size;
  } else {
    // modo 'conversacion': la racha se camina POR CUENTA e incluye los entrantes (mantienen
    // viva la racha) aunque nunca sumen. Se agrupa por idEmpresa sobre `texto` completo (no
    // `propios`), porque el entrante necesita participar del orden cronologico para poder
    // extender el silencio.
    const porEmpresa = new Map<string, ToqueCanal[]>();
    for (const t of texto) {
      const lista = porEmpresa.get(t.idEmpresa);
      if (lista) lista.push(t);
      else porEmpresa.set(t.idEmpresa, [t]);
    }

    let conversaciones = 0;
    for (const lista of porEmpresa.values()) {
      const ordenados = [...lista].sort((a, b) => claveOrdenAsc(a).localeCompare(claveOrdenAsc(b)));
      let ultimoDia: number | null = null;
      // Si la racha en curso ya tuvo al menos un toque propio (no entrante). Una racha hecha
      // solo de entrantes no es una conversacion nuestra: nunca mandamos nada, asi que no
      // suma a deduplicados (ver "solo entrantes, ningun toque nuestro" en el test).
      let rachaConToquePropio = false;

      for (const t of ordenados) {
        const dia = diaDeToque(t);
        // diaUTC devuelve milisegundos (Date.UTC): el gap en DIAS es la resta entre dos
        // dias/86_400_000, mismo patron que diasSinMovimiento en dashboard-cro.ts. Corta la
        // racha si es el primer evento, o si el gap supera el silencio, o si este toque no
        // tiene fecha usable: sin fecha no hay como probar que sigue la misma conversacion
        // que el evento anterior, asi que se trata como corte en vez de asumir continuidad
        // que el dato no sostiene.
        const gapDias = ultimoDia == null || dia == null ? null : (dia - ultimoDia) / 86_400_000;
        const cortaRacha = gapDias == null || gapDias > diasDeSilencio;
        if (cortaRacha) {
          if (rachaConToquePropio) conversaciones++;
          rachaConToquePropio = false;
        }
        if (t.fuente !== 'whatsapp_entrante') rachaConToquePropio = true;
        if (dia != null) ultimoDia = dia;
      }
      if (rachaConToquePropio) conversaciones++;
    }
    deduplicados = conversaciones;
  }

  return { modo, crudos, deduplicados, colapsados: crudos - deduplicados };
}

// ── (4) LLAMADAS A CUENTAS NUEVAS ─────────────────────────────────────────────────────────
// Cuanto del esfuerzo de llamar va a abrir cuenta nueva (primer toque) contra cuanto es
// trabajar historia que ya existia. Solo llamadas: el texto (whatsapp/correo) no entra --
// esta metrica es sobre el canal mas caro por toque, no sobre actividad en general.

export type LlamadasPorNovedadDeCuenta = {
  llamadasTotal: number;
  aCuentasNuevas: number;
  aCuentasConHistoria: number;
};

export function llamadasPorNovedadDeCuenta(toques: ToqueCanal[]): LlamadasPorNovedadDeCuenta {
  const llamadas = toques.filter((t) => grupoDeCanal(t.canal) === 'llamada');
  const aCuentasNuevas = llamadas.filter((t) => t.esPrimerToqueDeLaCuenta).length;
  return {
    llamadasTotal: llamadas.length,
    aCuentasNuevas,
    aCuentasConHistoria: llamadas.length - aCuentasNuevas,
  };
}
