import { z } from 'zod';

// Regla de dominio (no de UI): las 4 salidas cerradas de un toque, y razonPerdida es
// obligatoria cuando resultado = 'contesto_no'. Vive junto al Repository porque es la
// fuente de verdad que CUALQUIER caller (server action, ingest worker de Fase 3,
// EnvioAdapter de Fase 5) debe cumplir. Un solo export reusable, no se duplica en otro lado.

export const CANALES = ['llamada', 'whatsapp', 'correo'] as const;
export type Canal = (typeof CANALES)[number];

// Canal de un TOQUE, que es un superset del canal de una CADENCIA (2026-07-25). La reunion es
// un toque real -- 115 de los 285 toques de produccion ya tienen canal='reunion', metidos por
// el importador de Notion -- pero NO es un canal de cadencia: un paso programado no puede ser
// "reunion" (no hay proveedor que la mande, no se puede encolar ni gotear). Por eso son dos
// listas y no una:
//   CANALES       -> lo que un paso de cadencia puede pedir (pasoParseadoSchema, readiness de
//                    campanas, CANALES_AUTOMATICOS).
//   CANALES_TOQUE -> lo que un toque puede registrar (registrarToqueSchema, marcarPerdida, MCP).
// Meter 'reunion' en CANALES habria abierto un canal de campana que nadie puede ejecutar.
export const CANALES_TOQUE = [...CANALES, 'reunion'] as const;
export type CanalToque = (typeof CANALES_TOQUE)[number];

// Canales con proveedor automatico HOY (sesion 2026-07-09, registro por canal en
// app/adapters/registro-envio.ts). Vive aca -- no en el adaptador -- porque el
// Repository (capa de datos) necesita esta lista para validar/filtrar sin depender de
// un adaptador concreto (romperia la direccion de dependencia: adaptadores dependen del
// Repository, nunca al reves). registro-envio.ts la reusa como fuente unica de verdad;
// un test cruzado (registro-envio.test.ts) verifica que las dos listas no se desincronicen.
export const CANALES_AUTOMATICOS: readonly Canal[] = ['correo', 'whatsapp'];

// Regla de dominio (sesion 2026-07-09): un paso solo puede ser automatico (es_manual=
// false) si su canal tiene proveedor registrado. Sin esto, un paso de whatsapp/llamada
// marcado automatico por error terminaria intentando mandarse por el proveedor de
// correo (el bug real que se encontro en las campanas 2/3/4 antes de esta regla).
// Vive en validation.ts (no en el Repository) para que agregarPasoCadencia y
// actualizarPasoCadencia la compartan sin duplicar el mensaje de error.
export function validarCanalAutomatico(canal: Canal, esManual: boolean): void {
  if (!esManual && !CANALES_AUTOMATICOS.includes(canal)) {
    throw new Error(
      `El canal "${canal}" todavía no tiene proveedor automático; este paso tiene que quedar manual (revisión en /cola).`,
    );
  }
}

// La taxonomia de lo que puede pasar en un toque (2026-07-25). Los CINCO primeros son los
// originales y NO se renombran ni se borran: 285 filas de produccion ya escribieron esos
// valores, y renombrar un enum de texto en SQLite significa reescribir filas historicas.
// Los 15 de abajo son los que faltaban para cubrir la taxonomia real del negocio (la outcome
// library del brain, ventas/frameworks/outcome-library.md): antes todo colapsaba a "contesto /
// no contesto / agendo", asi que "contesto la recepcionista y no paso al gerente" y "el gerente
// dijo que no" quedaban escritos igual.
//
// Mapeo viejo -> nuevo (el viejo sigue siendo valido; el nuevo es el que dice mas):
//   no_contesto                 = no-contesto de la library. Se queda tal cual, no se duplica.
//   contesto_reunion            -> gerente_interesado_agenda (o reactivacion_reinteres si la
//                                  cuenta venia de on_hold). Los tres agendan.
//   contesto_sigue_seguimiento  -> gerente_interesado_sin_agenda (interes sin fecha) o
//                                  reprogramar ("llamame mas tarde"), que no son lo mismo.
//   contesto_no                 -> no_interesado (dijo que no) o perdido (no va) o ghosting
//                                  (dejo de responder). Antes los tres eran "contesto_no".
//   no_llego                    = no-show de una reunion agendada. No esta en la library
//                                  porque la library describe toques, no ausencias.
// Nada obliga a migrar los toques viejos: los cinco valores siguen escribiendose.
export const RESULTADOS = [
  'contesto_reunion',
  'contesto_sigue_seguimiento',
  'contesto_no',
  'no_contesto',
  // No-show de una reunion ya agendada (2026-07-14): distinto a las 4 salidas de arriba,
  // que son intentos de CONTACTO. Esta es el desenlace de algo que ya estaba en el
  // calendario. A proposito NO entra a RESULTADOS_CONTESTO -- no hubo conversacion, nada
  // que buscar en Granola ni que calificar.
  'no_llego',
  // Contacto y conexion: donde se cae la mayoria de los intentos y donde el enum viejo no
  // distinguia nada. Un PBX que no pasa y un PBX que pasa al gerente llevan a acciones
  // opuestas (dejar de llamar vs llamar ya), y los dos eran 'no_contesto'.
  'pbx_sin_decisor',
  'pbx_paso_gerente',
  'reprogramar',
  // Interes y reunion.
  'gerente_interesado_agenda',
  'gerente_interesado_sin_agenda',
  'reactivacion_reinteres',
  'no_interesado',
  // Reunion: como salio la reunion que SI se dio. Con no_llego arriba, estos cuatro son los
  // que permiten el no-show rate (no_llego / reuniones que estaban agendadas).
  'reunion_fria',
  'reunion_buena',
  'se_presento',
  // Cierre.
  'objecion_precio',
  'push_cierre',
  'pago',
  // Perdida.
  'ghosting',
  'perdido',
] as const;
export type Resultado = (typeof RESULTADOS)[number];

// Labels legibles (voz-onepay: sin emojis, sin em dash, directo). Un solo export reusable:
// CaptureForm.tsx (botones) y page.tsx (historial de toques) lo comparten para no duplicar el
// mapeo de texto en dos lugares. Tambien es lo que renderToquesHechos manda a Notion, asi que
// aca no entra ni una palabra de la maquinaria interna.
export const RESULTADO_LABELS: Record<Resultado, string> = {
  contesto_reunion: 'Reunión agendada',
  contesto_sigue_seguimiento: 'Sigue en follow-up',
  contesto_no: 'No sigue',
  no_contesto: 'No contestó',
  no_llego: 'No llegó a la reunión',
  pbx_sin_decisor: 'PBX, no pasó al que decide',
  pbx_paso_gerente: 'PBX pasó al gerente',
  reprogramar: 'Pidió que lo llamaran después',
  gerente_interesado_agenda: 'Interesado y agenda',
  gerente_interesado_sin_agenda: 'Interesado, sin agendar',
  reactivacion_reinteres: 'Se re-interesa',
  no_interesado: 'No interesado',
  reunion_fria: 'Reunión fría',
  reunion_buena: 'Reunión buena',
  se_presento: 'Se presentó',
  objecion_precio: 'Objeción de precio',
  push_cierre: 'Push de cierre',
  pago: 'Pagó',
  ghosting: 'Ghosting',
  perdido: 'Perdido',
};

// Los resultados que AGENDAN una reunion. Se lista aparte porque es lo que dispara la
// transicion de embudo a reunion_agendada (core/transicion-estado.ts): antes esa regla estaba
// escrita contra el literal 'contesto_reunion' y los dos valores nuevos que significan lo mismo
// habrian dejado la cuenta quieta.
export const RESULTADOS_AGENDA: readonly Resultado[] = [
  'contesto_reunion',
  'gerente_interesado_agenda',
  'reactivacion_reinteres',
];

// Los resultados que cierran la cuenta en negativo. Son los que EXIGEN razonPerdida: sin esto,
// 'perdido' y 'no_interesado' entrarian sin razon mientras 'contesto_no' sigue pidiendola, que
// es el hueco por donde razon_perdida se quedo con 1 fila llena sobre 285 toques.
export const RESULTADOS_PERDIDA: readonly Resultado[] = ['contesto_no', 'no_interesado', 'perdido'];

// Los cinco que ofrece el formulario web, que son los cinco originales. La taxonomia completa
// (20 valores) es para el registro por MCP, donde el resultado se elige leyendo la lista y no
// apretando un boton: veinte botones en una pantalla de captura no se leen, se ignoran. El
// formulario sigue escribiendo valores del mismo enum, solo que un subconjunto.
export const RESULTADOS_CAPTURA_WEB: readonly Resultado[] = [
  'contesto_reunion',
  'contesto_sigue_seguimiento',
  'contesto_no',
  'no_contesto',
  'no_llego',
];

// Los resultados de una reunion que SI ocurrio. Con 'no_llego' son el par que responde el
// no-show rate; se listan para no tener que repetir la lista en cada consumidor.
export const RESULTADOS_REUNION_OCURRIDA: readonly Resultado[] = ['reunion_fria', 'reunion_buena', 'se_presento'];

// Por que no se hizo un seguimiento programado (2026-07-25, tabla seguimiento_aplazado).
// Cerrado en cuatro valores a proposito: en texto libre "no me dio el dia" y "se me
// atraveso la U" son la misma causa escrita de dos formas, y con eso no se puede contar
// nada. El detalle en prosa va aparte, en `nota`, y no reemplaza al motivo.
//
// Los cuatro cortan por causa, no por sintoma, porque cada uno lleva a una accion distinta:
//   plan_irreal     - el numero de seguimientos planeados para el dia no era alcanzable.
//                     Se arregla planeando menos, no trabajando mas.
//   dia_atravesado  - el dia se atraveso (imprevisto, universidad, reunion que se alargo).
//                     Capacidad que existia y otra cosa se la comio.
//   tiempo_no_usado - hubo tiempo disponible y no se uso. Ni el plan ni el dia tienen la
//                     culpa; es el unico de los cuatro que habla de ejecucion.
//   cuenta_evitada  - esa cuenta en particular se esta evitando (la incomoda, la que
//                     siempre queda de ultima). Se ve al repetirse sobre la MISMA cuenta.
//
// NULL no es un quinto valor: significa "no lo dijo". Nunca se infiere el motivo desde la
// fecha, el owner ni la cuenta.
export const MOTIVOS_APLAZO = ['plan_irreal', 'dia_atravesado', 'tiempo_no_usado', 'cuenta_evitada'] as const;
export type MotivoAplazo = (typeof MOTIVOS_APLAZO)[number];

// V3.4: variantes de "hubo conversacion real", disparan la busqueda en Granola.
// no_contesto nunca la dispara (nunca hubo con quien hablar, nada que buscar). Tampoco los
// tres de PBX/reprogramar (hubo alguien al otro lado, pero no una conversacion comercial que
// valga la pena buscar grabada) ni ghosting (justamente, no hubo).
export const RESULTADOS_CONTESTO: readonly Resultado[] = [
  'contesto_reunion',
  'contesto_sigue_seguimiento',
  'contesto_no',
  'gerente_interesado_agenda',
  'gerente_interesado_sin_agenda',
  'reactivacion_reinteres',
  'no_interesado',
  'reunion_fria',
  'reunion_buena',
  'se_presento',
  'objecion_precio',
  'push_cierre',
  'pago',
  'perdido',
];

// Por que se pierde o se parquea una cuenta (2026-07-25). Los siete valores que el negocio ya
// usa, dictados por el operador y escritos tal cual en el pipeline. Cerrado por la misma razon
// que MOTIVOS_APLAZO: en texto libre "muy caro" y "el costo fijo le pesa" son la misma causa
// escrita de dos formas, y con eso no se puede contar nada. El detalle en prosa va aparte, en
// razonPerdidaNota, y no reemplaza al valor.
//
// Evidencia de que hacia falta: sobre 285 toques de produccion hay UNA sola razon_perdida
// escrita, y es prosa ("Tamano insuficiente, el ISP es muy pequeno para el pricing actual"),
// que en esta lista es no_califica_icp con su nota. Esa fila NO se toca.
//
// Ghosting no esta aca a proposito, aunque el pipeline lo tenga como opcion: es un RESULTADO
// del toque ('ghosting'), no una causa de perdida. Quien se pierde por ghosting deja las dos
// cosas escritas, el resultado y la razon real si se conoce.
export const RAZONES_PERDIDA = [
  'precio',
  'ya_tiene_pasarela',
  'no_toma_decisiones',
  'timing_malo',
  'no_califica_icp',
  'sin_presupuesto',
  'disputa_interna',
] as const;
export type RazonPerdida = (typeof RAZONES_PERDIDA)[number];

// Como se escribe cada razon donde la lee alguien de afuera. Es lo que viaja al outbox de
// Notion en vez del slug: el slug es la llave para contar, la etiqueta es lo que el pipeline
// muestra.
export const RAZON_PERDIDA_LABELS: Record<RazonPerdida, string> = {
  precio: 'Precio',
  ya_tiene_pasarela: 'Ya tiene pasarela',
  no_toma_decisiones: 'No toma decisiones',
  timing_malo: 'Timing malo',
  no_califica_icp: 'No califica ICP',
  sin_presupuesto: 'Sin presupuesto',
  disputa_interna: 'Disputa interna',
};

// La objecion VIVA, el mismo bloqueo antes de que mate el deal.
//
// OJO, ESTA LISTA ES UNA INFERENCIA, NO DICTADO DEL OPERADOR. Vocabulario inferido de
// ventas/frameworks/embudo.md el 2026-07-25, pendiente de que el operador dicte el suyo. Los
// siete primeros son la lista de razones de perdida que el si dicto, reusada aca bajo la
// hipotesis de que es el mismo bloqueo en dos momentos distintos (vivo mientras se maneja,
// terminal cuando se pierde) -- compartir la llave es lo que permitiria preguntar cuantas
// objeciones de precio se manejaron y cuantas terminaron en perdida por precio. duda_adopcion es
// el octavo y sale del embudo del brain, que distingue dos sabores de la objecion de precio
// ("ROI" vs "duda de adopcion") porque se manejan distinto.
//
// El doc de objeciones del brain (producto/onepay/objeciones.md) esta en estado "pendiente" y
// dice explicito "no inventar contenido", asi que esto no se presenta como suyo. Cuando el
// dicte la lista real, esta se reemplaza y el comentario se borra. Que quien lo lea en tres
// meses sepa que no salio de el.
//
// Cerrada en ESCRITURA, abierta a crecer: agregar un valor es una linea aca. Si la objecion no
// cabe en ninguna, se deja en null y se escribe objecionNota -- igual que el motivo de un
// aplazo. Nunca bloquea el registro del toque, que es lo que hace tolerable que la lista sea
// una hipotesis: lo que no encaje queda en prosa y no se pierde.
export const OBJECIONES = [...RAZONES_PERDIDA, 'duda_adopcion'] as const;
export type Objecion = (typeof OBJECIONES)[number];

// Quien ejecuta un toque cuando el caller no lo dice (decision del operador, 2026-07-25).
// Revierte la regla anterior ("NULL = no atribuido, nunca se asume"): en la practica dejo 71 de
// 71 toques del ultimo mes sin ejecutor, o sea el 100% del dato perdido por proteger un caso
// que casi no pasa. El campo sigue existiendo y se sigue mandando explicito cuando ejecuta otra
// persona (Felipe Castro, Camilo Fonseca); el default solo cubre el silencio.
export const EJECUTOR_POR_DEFECTO = 'Sebastian Acosta Molina';

// De donde salio una fila de empresa_estado_historial (2026-07-25). Los cinco cortan por
// QUIEN la escribio, que es lo que decide si cuenta para el ciclo de venta:
//   toque          - la gradua un toque real (registrarToque). Es movimiento comercial.
//   perdida        - la baja a on_hold de marcarPerdida. Tambien es real.
//   manual         - alguien movio la etapa a proposito, una cuenta a la vez (mover_estado).
//   snapshot       - la derivo comparar la foto de hoy contra la de ayer (empresa_estado_
//                    snapshot). Es OBSERVADA, no inferida: la cuenta estaba en cierre en la
//                    foto del lunes y en firma_pago en la del martes, asi que el cambio pasó el
//                    martes. Resolucion de un dia. Es el unico camino que fecha bien el tramo
//                    que se mueve a mano en Notion (cierre -> pago).
//   reconciliacion - la base se alineo a lo que Notion YA decia. La fecha es la de la CORRIDA
//                    del barrido, o sea un limite superior, no el dia del cambio: si el
//                    operador movio la cuenta el martes y el barrido corrio el jueves, la fila
//                    dice jueves. Por eso queda fuera de ORIGENES_FECHA_CONFIABLE y por eso
//                    existe el snapshot.
//   backfill       - corrida de script sobre muchas filas. Ruido puro para el ciclo.
// NULL = no lo dijo. Las 63 filas anteriores a esta columna quedan asi y no se rellenan.
export const ORIGENES_TRANSICION = [
  'toque',
  'perdida',
  'manual',
  'snapshot',
  'reconciliacion',
  'backfill',
] as const;
export type OrigenTransicion = (typeof ORIGENES_TRANSICION)[number];

// Los origenes cuya FECHA se puede usar para medir tiempo entre etapas. reconciliacion queda
// fuera: su fecha es la de la corrida del barrido, no la del cambio. backfill tambien.
export const ORIGENES_FECHA_CONFIABLE: readonly OrigenTransicion[] = ['toque', 'perdida', 'manual', 'snapshot'];

// Un dia calendario, y solo eso: 2026-07-27. Sin hora, sin prosa, sin "inicios de junio".
// Se valida el FORMATO y la existencia real del dia (2026-02-31 no pasa).
export const FECHA_DIA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const fechaDiaSchema = z
  .string()
  .regex(FECHA_DIA_REGEX, 'la fecha tiene que ser un dia ISO YYYY-MM-DD')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'ese dia no existe en el calendario');

// Una fecha de reunion: el dia, con hora opcional. La hora sirve para el calendario; el dia es
// lo que se cuenta. Se acepta 2026-07-27 y 2026-07-27T15:00 (o con segundos y Z).
export const FECHA_REUNION_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{3})?)?Z?)?$/;

export const fechaReunionSchema = z
  .string()
  .regex(FECHA_REUNION_REGEX, 'la fecha de la reunion tiene que ser YYYY-MM-DD, con hora opcional YYYY-MM-DDTHH:MM')
  .refine((v) => {
    const dia = v.slice(0, 10);
    const d = new Date(`${dia}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dia;
  }, 'ese dia no existe en el calendario');

export const kdmSchema = z.object({
  nombre: z.string().min(1),
  // Normaliza "" a undefined ANTES de exigir min(1): la garantía "string vacío = no vino
  // telefono" vive aquí, en el dominio, no en cada caller (server action, ingest worker de
  // Fase 3, EnvioAdapter de Fase 5).
  telefono: z
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : v))
    .optional(),
});

// V4.2: validacion de dominio de una cadencia parseada, antes de persistirla. El
// parser (app/core/cadencia-parser.ts) solo hace estructura; aqui se cierra la regla:
// canal es una de las 4 salidas conocidas, offsets enteros no negativos, al menos un
// paso. Vive junto al Repository (misma fuente de verdad que registrarToqueSchema),
// no en el core, para que el parser siga puro.
export const pasoParseadoSchema = z.object({
  orden: z.number().int().nonnegative(),
  diaOffset: z.number().int().nonnegative(),
  canal: z.enum(CANALES),
  asunto: z.string().min(1).optional(),
  cuerpo: z.string().min(1).optional(),
  objetivo: z.string().min(1).optional(),
  // esManual (V5.6): paso que espera revision humana antes de contar como enviado
  // (Tier 1). Default false: todo paso que no lo diga explicito es automatico.
  esManual: z.boolean().optional().default(false),
  // Parte 3 campanas: variables/firmaApollo salen del parser ([corchetes]/[[firma]]);
  // default vacio/false para callers que arman el paso a mano (tests, CSV sin copy).
  variables: z.array(z.string()).optional().default([]),
  firmaApollo: z.boolean().optional().default(false),
});

export const cadenciaParseadaSchema = z.object({
  nombre: z.string().min(1),
  descripcion: z.string().min(1).optional(),
  pasos: z.array(pasoParseadoSchema).min(1, 'una cadencia necesita al menos un paso'),
});

export type CadenciaParseadaInput = z.infer<typeof cadenciaParseadaSchema>;

// V4.3: lenguaje de segmentacion sobre la base propia. definicion es JSON con
// condiciones ANDeadas; cada campo es de esta whitelist cerrada (nombres de DOMINIO,
// no de columna: el Repository mapea nombre->columna). Zod rechaza cualquier campo u
// operador fuera de este set ANTES de tocar la DB, asi no hay SQL libre ni inyeccion.
export const CAMPOS_SEGMENTO = [
  'estado', // empresa.estado_notion (on_hold, oportunidad, lead...)
  'categoria', // isp / utility / otro
  'estado_comercial',
  'prioridad', // empresa.prioridad_comercial (el "tier", numerico)
  'es_cliente', // 0 / 1
  'ciudad',
  'departamento', // empresa.departamento (la "region" del wall)
  'owner',
  'usuarios', // empresa_usuarios.usuarios_estimados (via LEFT JOIN)
  'rol', // contacto.cargo_categoria: la empresa tiene >=1 contacto con ese rol (EXISTS)
  // Task 15: empresa.notion_page_id. es_null = nunca entro al CRM (lead muerto que la
  // Task 7 ya saca del embudo); no_null = si esta en Notion. Segmentacion, no embudo:
  // aca es donde vive filtrar "cazar leads que nunca entraron al CRM" (causa raiz 1).
  'en_notion',
] as const;
export type CampoSegmento = (typeof CAMPOS_SEGMENTO)[number];

// Parte 1 campanas: subset de campos donde un rango numerico tiene sentido.
// rol es string (usa en/no_en) y NO va aqui; personas (cantidad de contactos de la
// empresa, via COUNT) si.
export const CAMPOS_SEGMENTO_NUMERICOS = ['prioridad', 'es_cliente', 'usuarios', 'personas'] as const;
export type CampoSegmentoNumerico = (typeof CAMPOS_SEGMENTO_NUMERICOS)[number];

// rol vive en contacto (1-a-muchos, resuelto via EXISTS en condicionRol): es_null/no_null
// no tiene una semantica de columna ahi, y condicionRol lo rechaza en tiempo de ejecucion.
// Excluirlo aca mueve ese rechazo a Zod (falla explicita en el Copiloto) en vez de reventar
// la query al correr el segmento.
const CAMPOS_SEGMENTO_NULEABLES = CAMPOS_SEGMENTO.filter((c) => c !== 'rol');

const condicionEnSchema = z.object({
  campo: z.enum(CAMPOS_SEGMENTO),
  op: z.enum(['en', 'no_en']),
  valores: z.array(z.string().min(1)).min(1, 'la condicion en/no_en necesita al menos un valor'),
});
const condicionNullSchema = z.object({
  campo: z.enum(CAMPOS_SEGMENTO_NULEABLES),
  op: z.enum(['es_null', 'no_null']),
});

// Parte 1 campanas: operador de rango, solo sobre campos numericos (usuarios,
// prioridad, es_cliente). refine corre DESPUES de que desde/hasta ya son numeros
// validos, mismo patron que el superRefine de registrarToqueSchema mas abajo.
const condicionEntreSchema = z
  .object({
    campo: z.enum(CAMPOS_SEGMENTO_NUMERICOS),
    op: z.literal('entre'),
    desde: z.number(),
    hasta: z.number(),
  })
  .refine((c) => c.desde <= c.hasta, {
    message: "'desde' no puede ser mayor que 'hasta' en una condicion entre",
    path: ['desde'],
  });

// Parte 5 campanas: comparadores abiertos sobre campos numericos. La UI muestra
// "Usuarios > 200.000"; mayor_que/menor_que evitan tener que expresarlo como entre
// con un limite infinito artificial. Estrictos (>/<), no inclusivos: para inclusivo
// ya existe 'entre'.
const condicionComparaSchema = z.object({
  campo: z.enum(CAMPOS_SEGMENTO_NUMERICOS),
  op: z.enum(['mayor_que', 'menor_que']),
  valor: z.number(),
});

const condicionSegmentoSchema = z.union([condicionEnSchema, condicionNullSchema, condicionEntreSchema, condicionComparaSchema]);

// BORRADOR: lo que el Copiloto puede proponer y la UI puede tener en pantalla mientras se
// arma el segmento. Admite cero condiciones a proposito -- vacio es el estado inicial
// (NuevoSegmento.tsx lo llama VACIO) y es la respuesta CORRECTA a una instruccion que no
// mapea a ningun campo ("test" -> condiciones: [], noMapeado: ['test']).
//
// Existe separado por un bug real (2026-07-15): el Copiloto validaba su salida contra el
// schema estricto de abajo, asi que cualquier frase sin criterio de segmentacion moria en
// "El Copiloto propuso un segmento invalido" -- culpando al modelo por acertar. Los dos
// contratos vivian bajo un mismo nombre; separarlos es lo que arregla el bug sin tocar la
// reja. A nivel de TypeScript los dos tipos son IDENTICOS (min(1) no cambia el tipo
// inferido), asi que la separacion es puramente de validacion en runtime.
export const definicionSegmentoBorradorSchema = z.object({
  condiciones: z.array(condicionSegmentoSchema),
  // Ranking + tope: "las 50 mas grandes" = orden por usuarios desc, limite 50. Ambos
  // opcionales; sin ellos el segmento es el conjunto completo que cumple condiciones.
  orden: z.object({ campo: z.enum(CAMPOS_SEGMENTO_NUMERICOS), dir: z.enum(['asc', 'desc']) }).optional(),
  limite: z.number().int().positive().optional(),
});

// ESTRICTO: lo que se puede GUARDAR y EJECUTAR. min(1) es una reja de seguridad, no una
// formalidad: un segmento sin condiciones matchea la base ENTERA, o sea una campana
// masiva a todo el mundo. Todo lo que persiste o inscribe pasa por aca (repository.ts,
// guardarSegmentoAction); el Copiloto no.
export const definicionSegmentoSchema = definicionSegmentoBorradorSchema.extend({
  condiciones: z.array(condicionSegmentoSchema).min(1, 'un segmento necesita al menos una condicion'),
});

export type DefinicionSegmento = z.infer<typeof definicionSegmentoSchema>;
export type DefinicionSegmentoBorrador = z.infer<typeof definicionSegmentoBorradorSchema>;

// V4.4: alta de una version A/B colgada de un paso. peso reparte el trafico en el
// motor en seco (0 = version apagada, no recibe). Iterar copy = agregar una version,
// no editar la ya enviada.
export const versionPasoInputSchema = z.object({
  nombre: z.string().min(1),
  asunto: z.string().min(1).optional(),
  cuerpo: z.string().min(1).optional(),
  peso: z.number().int().nonnegative().default(1),
  esDefault: z.boolean().optional(),
});

export type VersionPasoInput = z.infer<typeof versionPasoInputSchema>;

// V4.5: una campana es una cadencia aplicada a un segmento. estado nace 'borrador';
// inscribir la pasa a correr.
export const MODOS_CAMPANA = ['prioritaria', 'batch'] as const;
export type ModoCampana = (typeof MODOS_CAMPANA)[number];

// Parte 5 campanas: que hacer cuando un paso pide un canal que la empresa no
// tiene. Default 'cola': la empresa espera en vez de que se le mande cualquier
// cosa o se le salte un paso sin que nadie lo decida a proposito.
export const REGLAS_FALTANTE = ['reemplazar', 'saltar', 'cola'] as const;
export type ReglaFaltanteInput = (typeof REGLAS_FALTANTE)[number];

// Fase 8 (Lanzar): ritmo del goteo de INGRESO (cuando arranca cada cuenta nueva),
// no del calendario de toques (eso ya lo fija dia_offset en paso_cadencia).
// 'personalizado' se deja abierto para el detalle que arme calcularGoteo (Task 8.2),
// no se cierra aqui a una forma concreta.
export const RITMOS_INGRESO = ['diario', 'dia_si_dia_no', 'personalizado'] as const;
export type RitmoIngresoInput = (typeof RITMOS_INGRESO)[number];

export const campanaInputSchema = z.object({
  nombre: z.string().min(1),
  idCadencia: z.number().int().positive(),
  idSegmento: z.number().int().positive(),
  owner: z.string().min(1).optional(),
  // Parte 4 campanas: prioritaria = revisar/personalizar toque a toque; batch = el
  // copy default sale tal cual al grupo del dia. Default prioritaria: mas segura,
  // batch es un opt-in explicito (para tiers bajos donde no vale la pena personalizar).
  modo: z.enum(MODOS_CAMPANA).optional().default('prioritaria'),
  reglaFaltante: z.enum(REGLAS_FALTANTE).optional().default('cola'),
  // intake_diario: cuantas cuentas nuevas arrancan la cadencia por dia (goteo).
  // undefined = todas el dia 1.
  intakeDiario: z.number().int().positive().optional(),
  ritmoIngreso: z.enum(RITMOS_INGRESO).optional().default('diario'),
  // topeToquesDia: control REAL por campana (Fase 8), editable en el wizard de Lanzar.
  // undefined/null = sin tope.
  topeToquesDia: z.number().int().positive().optional(),
  // fechaInicio: ISO date. undefined = arranca hoy.
  fechaInicio: z.string().min(1).optional(),
});

// z.input (no z.infer/z.output): modo tiene default(), asi que en la salida ya
// parseada queda obligatorio, pero el caller (antes de parsear) no esta obligado
// a mandarlo. Mismo problema que tendria owner si tuviera default.
export type CampanaInput = z.input<typeof campanaInputSchema>;

export const registrarToqueSchema = z
  .object({
    idEmpresa: z.string().min(1),
    canal: z.enum(CANALES_TOQUE),
    resultado: z.enum(RESULTADOS),
    // El DIA del toque. Opcional: sin fecha se usa hoy, que es el caso normal (se registra el
    // mismo dia). Existe para el toque que se dicta al dia siguiente, que antes entraba con la
    // fecha de cuando se escribio y no de cuando paso.
    fecha: fechaDiaSchema.optional(),
    duracionSegundos: z.number().int().nonnegative().optional(),
    quePaso: z.string().min(1).optional(),
    proximoFollowUp: z.string().min(1).optional(),
    proximoCanal: z.string().min(1).optional(),
    usuarios: z.number().optional(),
    crm: z.string().min(1).optional(),
    pasarela: z.string().min(1).optional(),
    // Vocabulario cerrado + nota libre, el mismo par que motivo/nota en aplazar_seguimiento.
    // Lo que no cabe en la lista NO se fuerza: se deja la nota y el campo acotado en null.
    razonPerdida: z.enum(RAZONES_PERDIDA).optional(),
    razonPerdidaNota: z.string().min(1).optional(),
    objecion: z.enum(OBJECIONES).optional(),
    objecionNota: z.string().min(1).optional(),
    // Puntero a la grabacion, si existe. Las tres columnas ya estaban en la tabla y ningun
    // camino de escritura las llenaba, asi que un toque no podia enlazar su grabacion. Se
    // exponen; el pipeline de audio detras queda aplazado por decision del operador.
    //
    // Dos proveedores distintos y no intercambiables: las REUNIONES se graban en tldv, las
    // LLAMADAS en granola. El proveedor se guarda como DATO (string abierto), no como enum, por
    // la misma regla del repo que ya aplica a canal. Y los tres son OPCIONALES de verdad: una
    // llamada por telefono o por WhatsApp puede no quedar grabada en ninguna parte, y eso no
    // invalida el toque ni bloquea la escritura.
    transcriptProveedor: z.string().min(1).optional(),
    transcriptId: z.string().min(1).optional(),
    transcriptUrl: z.string().min(1).optional(),
    // Las dos fechas de la reunion. Solo tienen sentido con canal 'reunion' o con un resultado
    // que agenda; se enforza abajo.
    reunionFechaPropuesta: fechaReunionSchema.optional(),
    reunionFechaOcurrida: fechaReunionSchema.optional(),
    // Quien hizo la llamada o mando el mensaje. Con default desde el 2026-07-25: sin default,
    // 71 de 71 toques del ultimo mes quedaron sin atribuir. Se sigue mandando explicito cuando
    // ejecuta otra persona.
    ejecutadoPor: z.string().min(1).optional().default(EJECUTOR_POR_DEFECTO),
    // A QUE PERSONA se toco, cuando ya existe en `contacto` (2026-07-26). Antes solo se podia
    // enlazar creando el contacto por `kdm`, asi que quien ya tenia el contacto en la base no
    // tenia como decirlo y toque.id_contacto se quedaba en NULL. Cinco llamadas a la
    // recepcionista y dos al dueno no son el mismo proceso, y sin esta columna se cuentan igual.
    //
    // Se valida contra la base (existe Y pertenece a esa empresa) dentro de la transaccion de
    // registrarToque: aca solo se comprueba que sea un id entero positivo.
    idContacto: z.number().int().positive().optional(),
    kdm: kdmSchema.optional(),
  })
  .superRefine((data, ctx) => {
    invariantesToque(data, ctx);
    // Las dos formas de decir a quien se toco son excluyentes: idContacto apunta a un contacto
    // que YA existe, kdm crea o actualiza uno. Mandar las dos deja sin definir cual gana, y
    // elegir en silencio es lo que produce un enlace equivocado que nadie revisa despues.
    if (data.idContacto != null && data.kdm) {
      ctx.addIssue({
        code: 'custom',
        path: ['idContacto'],
        message: 'manda idContacto (contacto que ya existe) o kdm (contacto a crear), no los dos',
      });
    }
  });

// z.input, no z.infer: ejecutadoPor tiene default(), asi que en la salida ya parseada queda
// obligatorio pero el caller no esta obligado a mandarlo. Mismo caso que CampanaInput.
export type RegistrarToqueInput = z.input<typeof registrarToqueSchema>;
export type RegistrarToqueParsed = z.output<typeof registrarToqueSchema>;

// Las reglas que un toque tiene que cumplir MIRE COMO MIRE, se este creando o corrigiendo
// (2026-07-26). Vivian dentro del superRefine de registrarToqueSchema; se extraen porque
// editarToque tiene que reimponerlas sobre la fila YA MEZCLADA (lo que hay en la base + el
// parche), no sobre el parche suelto: corregir el resultado a 'no_llego' sin mandar la fecha
// propuesta tiene que fallar aunque el parche no la mencione. Copiar las cuatro reglas en el
// segundo camino era garantizar que se desincronizaran.
//
// Los mensajes y los `path` quedan identicos a los que ya devolvia registrarToqueSchema: quien
// los lea no tiene por que enterarse de este refactor.
export type ToqueInvariantes = {
  canal?: string | null;
  resultado?: string | null;
  razonPerdida?: string | null;
  reunionFechaPropuesta?: string | null;
  reunionFechaOcurrida?: string | null;
};

export function invariantesToque(data: ToqueInvariantes, ctx: z.RefinementCtx): void {
  if (data.resultado && RESULTADOS_PERDIDA.includes(data.resultado as Resultado) && !data.razonPerdida) {
    ctx.addIssue({
      code: 'custom',
      path: ['razonPerdida'],
      message: `razonPerdida es obligatoria cuando resultado es '${data.resultado}': uno de ${RAZONES_PERDIDA.join(' | ')}`,
    });
  }
  // Un no-show es el desenlace de una reunion que estaba en el calendario: sin la fecha
  // propuesta no se puede calcular el no-show rate, que es justo para lo que existe el
  // resultado. Se exige en vez de dejarlo pasar a medias.
  if (data.resultado === 'no_llego' && !data.reunionFechaPropuesta) {
    ctx.addIssue({
      code: 'custom',
      path: ['reunionFechaPropuesta'],
      message: "reunionFechaPropuesta es obligatoria cuando resultado es 'no_llego': sin la fecha que se incumplio no hay no-show que contar",
    });
  }
  // Una reunion que ocurrio y un no-show son excluyentes. Dejar las dos escritas produce una
  // fila que dice que la reunion paso y no paso.
  if (data.resultado === 'no_llego' && data.reunionFechaOcurrida) {
    ctx.addIssue({
      code: 'custom',
      path: ['reunionFechaOcurrida'],
      message: "un toque con resultado 'no_llego' no puede tener reunionFechaOcurrida: la reunion no ocurrio",
    });
  }
  if (data.reunionFechaOcurrida && data.canal !== 'reunion') {
    ctx.addIssue({
      code: 'custom',
      path: ['reunionFechaOcurrida'],
      message: "reunionFechaOcurrida solo aplica con canal 'reunion': una llamada no es una reunion",
    });
  }
}

// --- editar_toque (2026-07-26) ---------------------------------------------------------
//
// El parche de un toque YA ESCRITO. Existe porque registrarToque solo crea: tres reuniones con
// duracion conocida (55, 71 y 50 minutos, sacadas de tl;dv) y un texto de procedencia
// incompleto se quedaron sin arreglo esta semana, y la unica salida era un UPDATE a mano contra
// produccion.
//
// Que NO se puede cambiar por aca, a proposito:
//   idEmpresa      - mover un toque de cuenta no es corregir, es reescribir la historia de dos
//                    cuentas a la vez. Si el toque quedo en la empresa equivocada, se registra
//                    en la correcta y el otro se corrige con quePaso diciendo que fue un error.
//   fuente         - dice de donde nacio la fila (cockpit, notion_toques, whatsapp_entrante).
//                    Es procedencia, no contenido.
//   idOrganizacion - la fija la sesion, nunca el cliente.
//
// null vs ausente: ausente = no se toca, null = se borra. Es la unica forma de vaciar un campo
// que quedo mal sin inventar un valor centinela. resultado y canal no aceptan null: son la
// espina del toque y un toque sin ninguno de los dos no se puede contar en nada.
export const editarToqueSchema = z
  .object({
    idToque: z.number().int().positive(),
    // Por que se edita. OBLIGATORIO y en prosa: es lo unico que distingue "llego el dato de
    // tl;dv" de "me equivoque al dictar", y sin el la bitacora dice que algo cambio pero no
    // por que. Se guarda en sync_cambios junto a los campos que se movieron.
    motivo: z.string().min(1),
    canal: z.enum(CANALES_TOQUE).optional(),
    resultado: z.enum(RESULTADOS).optional(),
    fecha: fechaDiaSchema.optional(),
    duracionSegundos: z.number().int().nonnegative().nullable().optional(),
    quePaso: z.string().min(1).nullable().optional(),
    razonPerdida: z.enum(RAZONES_PERDIDA).nullable().optional(),
    razonPerdidaNota: z.string().min(1).nullable().optional(),
    objecion: z.enum(OBJECIONES).nullable().optional(),
    objecionNota: z.string().min(1).nullable().optional(),
    reunionFechaPropuesta: fechaReunionSchema.nullable().optional(),
    reunionFechaOcurrida: fechaReunionSchema.nullable().optional(),
    transcriptProveedor: z.string().min(1).nullable().optional(),
    transcriptId: z.string().min(1).nullable().optional(),
    transcriptUrl: z.string().min(1).nullable().optional(),
    ejecutadoPor: z.string().min(1).optional(),
    idContacto: z.number().int().positive().nullable().optional(),
  })
  .refine(
    (d) => Object.keys(d).some((k) => k !== 'idToque' && k !== 'motivo'),
    { message: 'no viene ningun campo que editar: manda al menos uno ademas de idToque y motivo' },
  );

export type EditarToqueInput = z.input<typeof editarToqueSchema>;
export type EditarToqueParsed = z.output<typeof editarToqueSchema>;

// --- plan del dia (2026-07-26) ---------------------------------------------------------
//
// Que se PENSABA tocar, frente a lo que se toco. Hasta hoy el plan del dia vivia en un markdown
// del brain: no se podia preguntar cuantas cuentas se planearon en la semana ni cuantas de las
// planeadas se quedaron sin tocar.
//
// Los dos vocabularios salen del DDL propuesto por experto-followups
// (drizzle/manual/0016_toque_planeado.sql) y se declaran aca porque es donde vive toda lista
// cerrada del dominio. No se inventa una lista paralela para lo mismo.
//
// tipo = que CLASE de toque es, no por donde va. El canal es aparte y opcional (se puede
// planear tocar una cuenta sin haber decidido todavia si es llamada o WhatsApp):
//   frio         - primer contacto, la cuenta no viene de nada.
//   seguimiento  - continua una conversacion que ya existe.
//   cierre       - empuja una cuenta que ya esta en la parte baja del embudo.
export const TIPOS_PLAN = ['frio', 'seguimiento', 'cierre'] as const;
export type TipoPlan = (typeof TIPOS_PLAN)[number];

// De donde salio la linea del plan. Separa lo que pidio el sistema de lo que decidio la persona,
// y deja ver la cuenta que lleva dias rodando sin que nadie la toque:
//   cadencia  - la pidio una cadencia (hay un paso instanciado con su fecha).
//   rodado    - venia del plan de un dia anterior y no se ejecuto, se rodo a este.
//   manual    - la puso el operador, sin que ningun motor la pidiera.
export const ORIGENES_PLAN = ['cadencia', 'rodado', 'manual'] as const;
export type OrigenPlan = (typeof ORIGENES_PLAN)[number];

export const planearDiaSchema = z.object({
  fecha: fechaDiaSchema,
  cuentas: z
    .array(
      z.object({
        idEmpresa: z.string().min(1),
        tipo: z.enum(TIPOS_PLAN),
        origen: z.enum(ORIGENES_PLAN),
        // Opcional de verdad: NULL significa "se planeo tocarla y todavia no se decidio el
        // canal". No se rellena con el proximo_canal de la cuenta, que seria inventar la
        // decision que justamente no se tomo.
        canal: z.enum(CANALES_TOQUE).optional(),
        nota: z.string().min(1).optional(),
      }),
    )
    .min(1),
  // Mismo default y misma razon que ejecutadoPor en un toque: hoy el unico que planea dictando
  // es el operador, y un campo que nunca se llena no protege nada.
  planeadoPor: z.string().min(1).optional().default(EJECUTOR_POR_DEFECTO),
});
export type PlanearDiaInput = z.input<typeof planearDiaSchema>;

// --- marcar_no_ejecutado (2026-07-26) ---------------------------------------------------
//
// El cierre del dia: de lo que se planeo, esto no se hizo, y por esto. Escribe
// motivo_no_ejecutado sobre la linea del plan.
//
// Existe porque hasta hoy el motivo SOLO existia si ademas se corrio un aplazo, y las dos cosas
// no son la misma: "no lo hice porque el dia se atraveso" no siempre mueve una fecha. Una cuenta
// que no se toco y cuyo follow-up sigue donde estaba quedaba sin motivo posible, y su ausencia
// se leia igual que la de una cuenta que nadie planeo.
//
// El motivo reusa MOTIVOS_APLAZO tal cual, no un vocabulario paralelo: la pregunta es la misma
// (por que no se hizo lo que estaba para hacerse) y dos listas para lo mismo se desincronizan.
// Sigue siendo opcional: NULL = no lo dijo, y jamas se infiere. Marcar sin motivo tambien es
// registrar, porque deja escrito que el operador REVISO esa linea y decidio no dar razon, que es
// distinto de una linea que nadie miro.
export const marcarNoEjecutadoSchema = z.object({
  fecha: fechaDiaSchema,
  cuentas: z
    .array(
      z.object({
        idEmpresa: z.string().min(1),
        // Solo hace falta cuando la cuenta tiene mas de una linea ese dia (se planearon dos
        // canales). Sin canal y con dos lineas, la accion RECHAZA la cuenta en vez de elegir
        // una: adivinar cual de las dos no se hizo es inventar el dato.
        canal: z.enum(CANALES_TOQUE).optional(),
        motivo: z.enum(MOTIVOS_APLAZO).optional(),
        nota: z.string().min(1).optional(),
      }),
    )
    .min(1),
  // Motivo y nota para las lineas que no traen los suyos. Es el caso real del cierre del dia:
  // "estas cuatro no las hice, el dia se atraveso". El de la linea gana sobre este.
  motivo: z.enum(MOTIVOS_APLAZO).optional(),
  nota: z.string().min(1).optional(),
});
export type MarcarNoEjecutadoInput = z.input<typeof marcarNoEjecutadoSchema>;
