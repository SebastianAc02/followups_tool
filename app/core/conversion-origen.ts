// Pregunta del operador (dictada 2026-08-05): "cuantas llamadas me toma una reunion si viene
// un call, y cuantas llamadas me toma una reunion si viene el lead". El agregado de
// llamadasPorReunionConseguida (dashboard-cro.ts) no distingue prospectar en frio de atender
// un inbound, y esos dos no cuestan lo mismo -- con un solo numero no se puede decidir donde
// poner el tiempo. Pura: sin DB, sin I/O, mismo criterio que dashboard-cro.ts/actividad-canal.ts
// -- recibe arreglos de toques ya leidos y devuelve numeros y clasificaciones auditables.
import { type Resultado } from '../db/validation.ts';

// Lo minimo de un toque que este archivo necesita. A proposito NO es ToqueActividad
// (app/db/repository.ts): el core no importa el Repository (dependencia va al reves, ver
// embudo.ts "NO importa DB"). `origenLead` es una columna que hoy esta VACIA en las 1.956
// filas de produccion (medido 2026-08-05) -- el tipo la modela igual porque la funcion tiene
// que existir antes que el dato, no despues.
export type ToqueConOrigen = {
  idEmpresa: string;
  canal: string | null;
  resultado: Resultado | null;
  // 'whatsapp_entrante' identifica un mensaje que llego, no un toque que salio (mismo campo
  // que ToqueCanal.fuente en actividad-canal.ts y ToqueDashboardCRO.fuente en
  // dashboard-cro.ts). Cualquier otro valor es un toque nuestro.
  fuente: string;
  // inbound | outbound | evento | referido | null. null es "no se registro", NUNCA se lee
  // como outbound aunque outbound sea el origen mas comun -- ver el grupo sin_registrar mas
  // abajo, que es la razon de ser de este archivo.
  origenLead: string | null;
  reunionFechaPropuesta: string | null;
};

// Clave del grupo cuando la cuenta no tiene origenLead registrado en ningun toque. NUNCA se
// reparte entre los origenes que si tienen dato: es su propio grupo, auditable aparte, para
// que una comparacion inbound-vs-outbound calculada sobre una fraccion chica del pipeline no
// se lea como si fuera sobre el 100% (ver `cobertura`).
const CLAVE_SIN_REGISTRAR = 'sin_registrar';
const CLAVE_AGREGADO = '__agregado__';

export type ConversionOrigenGrupo = {
  origen: string;
  // canal 'llamada', excluyendo entrantes de whatsapp (mismo criterio defensivo que
  // tasaRespuestaPorEtapa en dashboard-cro.ts: un entrante no es trabajo del operador, asi
  // que no puede colarse como llamada aunque el canal viniera mal cargado como 'llamada').
  llamadas: number;
  // Mismo criterio EXACTO que llamadasPorReunionConseguida (dashboard-cro.ts): toda cuenta
  // con reunionFechaPropuesta en el periodo, sin filtrar por canal ni por fuente. Los dos
  // numeros tienen que ser comparables entre si, por eso no se inventa un segundo criterio
  // para la misma pregunta.
  reunionesConseguidas: number;
  // null, NUNCA Infinity ni 0, cuando reunionesConseguidas es cero: sin denominador no hay
  // tasa que calcular, y decir "0" inventaria un costo que el dato no sostiene.
  llamadasPorReunion: number | null;
};

// Una cuenta con dos toques que traen origenLead distinto es un dato inconsistente, no un
// promedio: el origen es propiedad de la CUENTA (de donde vino el lead), asi que dos valores
// distintos en la misma cuenta significan que alguien cargo mal uno de los dos toques. Se
// reporta aparte y se EXCLUYE de todo grupo (incluido sin_registrar y el agregado) en vez de
// asignarle un origen arbitrario o promediar su costo entre dos grupos que no comparten nada.
export type CuentaOrigenInconsistente = {
  idEmpresa: string;
  origenesVistos: string[];
};

// Cuantas cuentas DISTINTAS (no toques) tienen origen registrado. Sin este numero al lado,
// una comparacion inbound-vs-outbound calculada sobre el 3% del pipeline se lee como si fuera
// del 100%. Hoy origenLead esta vacio en las 1.956 filas de produccion, asi que al desplegar
// esto la cobertura tiene que salir en 0 -- eso es correcto, no se maquilla.
export type CoberturaOrigen = {
  // Incluye las cuentas inconsistentes: SI tienen origen registrado (contradictorio, pero
  // registrado), asi que cuentan del lado de "hay dato" para efectos de cobertura. Su ruido
  // se reporta aparte en `cuentasInconsistentes`, no se resta de aca.
  cuentasConOrigen: number;
  cuentasSinOrigen: number;
  totalCuentas: number;
  // null, NUNCA NaN, cuando totalCuentas es cero.
  fraccion: number | null;
};

export type ConversionPorOrigen = {
  porOrigen: ConversionOrigenGrupo[];
  // Suma exacta de porOrigen (nunca de toques crudos): las cuentas inconsistentes quedan
  // afuera del agregado igual que quedan afuera de cada grupo, porque su costo no es
  // atribuible a ningun origen y meterlo en el agregado inflaria un numero que se presenta
  // como partido por origen sin que en realidad lo este.
  agregado: ConversionOrigenGrupo;
  cobertura: CoberturaOrigen;
  cuentasInconsistentes: CuentaOrigenInconsistente[];
};

function calcularGrupo(origen: string, toques: ToqueConOrigen[]): ConversionOrigenGrupo {
  const llamadas = toques.filter((t) => t.canal === 'llamada' && t.fuente !== 'whatsapp_entrante').length;
  const reunionesConseguidas = toques.filter((t) => t.reunionFechaPropuesta != null).length;
  return {
    origen,
    llamadas,
    reunionesConseguidas,
    llamadasPorReunion: reunionesConseguidas === 0 ? null : llamadas / reunionesConseguidas,
  };
}

export function conversionPorOrigen(toques: ToqueConOrigen[]): ConversionPorOrigen {
  // Paso 1: agrupar por cuenta, porque el origen es propiedad de la CUENTA y no de un toque
  // individual (dos toques de la misma cuenta pueden traer origenLead null en uno y con dato
  // en el otro; el ultimo manda por sobre el vacio, ver paso 2).
  const porEmpresa = new Map<string, ToqueConOrigen[]>();
  for (const t of toques) {
    const lista = porEmpresa.get(t.idEmpresa);
    if (lista) lista.push(t);
    else porEmpresa.set(t.idEmpresa, [t]);
  }

  const cuentasInconsistentes: CuentaOrigenInconsistente[] = [];
  const gruposDeToques = new Map<string, ToqueConOrigen[]>();
  let cuentasConOrigen = 0;
  let cuentasSinOrigen = 0;

  for (const [idEmpresa, toquesCuenta] of porEmpresa) {
    const origenesUnicos = [...new Set(toquesCuenta.map((t) => t.origenLead).filter((o): o is string => o != null))];

    if (origenesUnicos.length > 1) {
      // Dato inconsistente: se reporta y se excluye de todo grupo (paso 3 no lo toca).
      cuentasInconsistentes.push({ idEmpresa, origenesVistos: origenesUnicos });
      cuentasConOrigen++; // tiene origen registrado, solo que contradictorio -- cuenta para cobertura igual.
      continue;
    }

    const clave = origenesUnicos.length === 1 ? origenesUnicos[0] : CLAVE_SIN_REGISTRAR;
    if (clave === CLAVE_SIN_REGISTRAR) cuentasSinOrigen++;
    else cuentasConOrigen++;

    const lista = gruposDeToques.get(clave);
    if (lista) lista.push(...toquesCuenta);
    else gruposDeToques.set(clave, [...toquesCuenta]);
  }

  // Orden alfabetico para que el resultado sea deterministico entre corridas (mismo motivo
  // que el orden de Object.entries en mixPorCanal no se garantiza).
  const porOrigen = [...gruposDeToques.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([origen, toquesGrupo]) => calcularGrupo(origen, toquesGrupo));

  const llamadasAgregado = porOrigen.reduce((acc, g) => acc + g.llamadas, 0);
  const reunionesAgregado = porOrigen.reduce((acc, g) => acc + g.reunionesConseguidas, 0);
  const agregado: ConversionOrigenGrupo = {
    origen: CLAVE_AGREGADO,
    llamadas: llamadasAgregado,
    reunionesConseguidas: reunionesAgregado,
    llamadasPorReunion: reunionesAgregado === 0 ? null : llamadasAgregado / reunionesAgregado,
  };

  const totalCuentas = porEmpresa.size;
  const cobertura: CoberturaOrigen = {
    cuentasConOrigen,
    cuentasSinOrigen,
    totalCuentas,
    fraccion: totalCuentas === 0 ? null : cuentasConOrigen / totalCuentas,
  };

  return { porOrigen, agregado, cobertura, cuentasInconsistentes };
}
