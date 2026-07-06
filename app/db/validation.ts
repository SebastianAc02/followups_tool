import { z } from 'zod';

// Regla de dominio (no de UI): las 4 salidas cerradas de un toque, y razonPerdida es
// obligatoria cuando resultado = 'contesto_no'. Vive junto al Repository porque es la
// fuente de verdad que CUALQUIER caller (server action, ingest worker de Fase 3,
// EnvioAdapter de Fase 5) debe cumplir. Un solo export reusable, no se duplica en otro lado.

export const CANALES = ['llamada', 'whatsapp', 'correo'] as const;
export type Canal = (typeof CANALES)[number];

export const RESULTADOS = [
  'contesto_reunion',
  'contesto_sigue_seguimiento',
  'contesto_no',
  'no_contesto',
] as const;
export type Resultado = (typeof RESULTADOS)[number];

// Labels legibles de las 4 salidas (voz-onepay: sin emojis, sin em dash, directo).
// Un solo export reusable: CaptureForm.tsx (botones) y page.tsx (historial de toques) lo
// comparten para no duplicar el mapeo de texto en dos lugares.
export const RESULTADO_LABELS: Record<Resultado, string> = {
  contesto_reunion: 'Reunión agendada',
  contesto_sigue_seguimiento: 'Sigue en follow-up',
  contesto_no: 'No sigue',
  no_contesto: 'No contestó',
};

// V3.4: variantes de "hubo conversacion real", disparan la busqueda en Granola.
// no_contesto nunca la dispara (nunca hubo con quien hablar, nada que buscar).
export const RESULTADOS_CONTESTO: readonly Resultado[] = ['contesto_reunion', 'contesto_sigue_seguimiento', 'contesto_no'];

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
  'owner',
] as const;
export type CampoSegmento = (typeof CAMPOS_SEGMENTO)[number];

const condicionEnSchema = z.object({
  campo: z.enum(CAMPOS_SEGMENTO),
  op: z.enum(['en', 'no_en']),
  valores: z.array(z.string().min(1)).min(1, 'la condicion en/no_en necesita al menos un valor'),
});
const condicionNullSchema = z.object({
  campo: z.enum(CAMPOS_SEGMENTO),
  op: z.enum(['es_null', 'no_null']),
});

export const definicionSegmentoSchema = z.object({
  condiciones: z.array(z.union([condicionEnSchema, condicionNullSchema])).min(1, 'un segmento necesita al menos una condicion'),
});

export type DefinicionSegmento = z.infer<typeof definicionSegmentoSchema>;

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
export const campanaInputSchema = z.object({
  nombre: z.string().min(1),
  idCadencia: z.number().int().positive(),
  idSegmento: z.number().int().positive(),
  owner: z.string().min(1).optional(),
});

export type CampanaInput = z.infer<typeof campanaInputSchema>;

export const registrarToqueSchema = z
  .object({
    idEmpresa: z.string().min(1),
    canal: z.enum(CANALES),
    resultado: z.enum(RESULTADOS),
    quePaso: z.string().min(1).optional(),
    proximoFollowUp: z.string().min(1).optional(),
    proximoCanal: z.string().min(1).optional(),
    usuarios: z.number().optional(),
    crm: z.string().min(1).optional(),
    pasarela: z.string().min(1).optional(),
    razonPerdida: z.string().min(1).optional(),
    objecion: z.string().min(1).optional(),
    kdm: kdmSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.resultado === 'contesto_no' && !data.razonPerdida) {
      ctx.addIssue({
        code: 'custom',
        path: ['razonPerdida'],
        message: "razonPerdida es obligatoria cuando resultado es 'contesto_no'",
      });
    }
  });

export type RegistrarToqueInput = z.infer<typeof registrarToqueSchema>;
